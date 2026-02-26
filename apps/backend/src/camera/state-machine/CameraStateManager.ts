/**
 * Camera State Manager
 *
 * Central state machine controlling all camera operations.
 * Ensures proper sequencing of operations and handles state transitions safely.
 */

import * as C from "../bindings/constants";
import {
  CameraState,
  isValidTransition,
  CameraEvent,
  CameraEventHandler,
  StateChangedEvent,
  CaptureResult,
  CaptureMetadata,
  LiveViewFrame,
  CameraInfo,
  SdCardInfo,
} from "./types";
import { StateSynchronizer } from "./StateSynchronizer";
import { SessionManager } from "./SessionManager";
import { LiveViewEngine } from "./LiveViewEngine";
import { cameraLogger } from "../logger";
import {
  CameraError,
  CameraNotInitializedError,
  CameraNotReadyError,
  StateTransitionError,
  StateTimeoutError,
  CaptureTimeoutError,
  LiveViewError,
} from "../errors";
import { EdsdkBindings } from "../bindings/edsdk-bindings";
import * as path from "path";
import * as fs from "fs";
import { nanoid } from "nanoid";

export class CameraStateManager {
  private state: CameraState = "IDLE";
  private stateHistory: { state: CameraState; timestamp: number }[] = [];
  private eventHandlers: CameraEventHandler[] = [];
  private stateLock: boolean = false;

  // Components
  private sessionManager: SessionManager | null = null;
  private stateSynchronizer: StateSynchronizer;
  private liveViewEngine: LiveViewEngine | null = null;

  // Configuration
  private outputDirectory: string;

  // Capture tracking
  private pendingCapture: {
    resolve: (result: CaptureResult) => void;
    reject: (error: Error) => void;
    sessionId: string;
    sequenceNumber: number;
    outputPath: string;
  } | null = null;

  // Statistics
  private captureCount: number = 0;
  private lastCaptureAt: string | null = null;

  constructor(outputDirectory: string = "./photos") {
    this.outputDirectory = outputDirectory;
    this.stateSynchronizer = new StateSynchronizer({
      pollIntervalMs: 100,
      timeoutMs: 5000,
      maxRetries: 5,
      retryDelayMs: 200,
    });
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  onEvent(handler: CameraEventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index !== -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  private emit(event: CameraEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        Promise.resolve(handler(event)).catch((error) => {
          cameraLogger.error("CameraStateManager: Event handler error", { error });
        });
      } catch (error) {
        cameraLogger.error("CameraStateManager: Event handler error", { error });
      }
    }
  }

  // ============================================================================
  // State Management
  // ============================================================================

  getState(): CameraState {
    return this.state;
  }

  getStateHistory(): { state: CameraState; timestamp: number }[] {
    return [...this.stateHistory];
  }

  private assertState(expected: CameraState[]): void {
    if (!expected.includes(this.state)) {
      throw new StateTransitionError(this.state, expected[0], {
        currentState: this.state,
        expectedStates: expected,
      });
    }
  }

  private async transitionTo(newState: CameraState): Promise<void> {
    // Wait for any pending state change
    while (this.stateLock) {
      await this.sleep(10);
    }

    this.stateLock = true;

    try {
      // Validate transition
      if (!isValidTransition(this.state, newState)) {
        throw new StateTransitionError(this.state, newState);
      }

      const oldState = this.state;
      cameraLogger.debug(
        `CameraStateManager: Transitioning ${oldState} -> ${newState}`
      );

      // Perform state transition
      this.state = newState;
      this.stateHistory.push({ state: newState, timestamp: Date.now() });

      // Emit state changed event
      const event: StateChangedEvent = {
        type: "stateChanged",
        from: oldState,
        to: newState,
        timestamp: Date.now(),
      };
      this.emit(event);

      cameraLogger.info(`CameraStateManager: State changed to ${newState}`);
    } finally {
      this.stateLock = false;
    }
  }

  // ============================================================================
  // Lifecycle Operations
  // ============================================================================

  async initialize(): Promise<CameraInfo> {
    this.assertState(["IDLE", "ERROR"]);
    await this.transitionTo("INITIALIZING");

    try {
      // Create session manager with event handlers
      this.sessionManager = new SessionManager(
        this.handleObjectEvent.bind(this),
        this.handlePropertyEvent.bind(this),
        this.handleStateEvent.bind(this)
      );

      // Initialize and connect to camera
      const cameraInfo = await this.sessionManager.initialize();

      await this.transitionTo("CONNECTED");

      return cameraInfo;
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.state === "IDLE" || this.state === "DISCONNECTING") {
      return;
    }

    cameraLogger.info("CameraStateManager: Disconnecting");
    await this.transitionTo("DISCONNECTING");

    try {
      // Stop live view if active
      if (this.liveViewEngine) {
        await this.liveViewEngine.stop();
        this.liveViewEngine = null;
      }

      // Close session
      if (this.sessionManager) {
        await this.sessionManager.disconnect();
        this.sessionManager = null;
      }

      await this.transitionTo("IDLE");
      cameraLogger.info("CameraStateManager: Disconnected");
    } catch (error) {
      cameraLogger.error("CameraStateManager: Error during disconnect", { error });
      // Force to IDLE even on error
      this.state = "IDLE";
    }
  }

  async recover(): Promise<void> {
    if (this.state !== "ERROR") {
      return;
    }

    cameraLogger.info("CameraStateManager: Attempting recovery");

    try {
      await this.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    // Wait a moment before reconnecting
    await this.sleep(1000);

    // Try to reinitialize
    await this.initialize();
  }

  // ============================================================================
  // Live View Operations
  // ============================================================================

  async startLiveView(): Promise<void> {
    this.assertState(["CONNECTED"]);
    await this.transitionTo("ENTERING_LIVEVIEW");

    try {
      if (!this.sessionManager) {
        throw new CameraNotInitializedError("startLiveView");
      }

      const sdk = this.sessionManager.getSdk();
      const cameraRef = this.sessionManager.getCameraRef();

      // Wait for camera to be ready
      const ready = await this.stateSynchronizer.waitForReady(
        sdk.EdsGetPropertyData.bind(sdk),
        cameraRef,
        5000
      );

      if (!ready) {
        throw new CameraNotReadyError("Camera busy, cannot start live view", {
          operation: "startLiveView",
        });
      }

      // Step 1: Set Output Device to PC
      cameraLogger.debug("CameraStateManager: Setting EVF OutputDevice to PC");
      await this.setProperty(
        C.kEdsPropID_Evf_OutputDevice,
        C.kEdsEvfOutputDevice_PC
      );

      // Step 2: Wait for camera to confirm OutputDevice change
      const outputResult = await this.stateSynchronizer.waitForProperty(
        async () => {
          return await this.stateSynchronizer.getPropertyWithRetry(
            sdk.EdsGetPropertyData.bind(sdk),
            cameraRef,
            C.kEdsPropID_Evf_OutputDevice
          );
        },
        C.kEdsEvfOutputDevice_PC,
        3000
      );

      if (!outputResult.success) {
        throw new LiveViewError("Failed to set EVF output device to PC", {
          operation: "startLiveView",
        });
      }

      // Step 3: Enable EVF Mode
      cameraLogger.debug("CameraStateManager: Enabling EVF Mode");
      await this.setProperty(C.kEdsPropID_Evf_Mode, 1);

      // Step 4: Wait for camera to confirm EVF Mode
      const modeResult = await this.stateSynchronizer.waitForProperty(
        async () => {
          return await this.stateSynchronizer.getPropertyWithRetry(
            sdk.EdsGetPropertyData.bind(sdk),
            cameraRef,
            C.kEdsPropID_Evf_Mode
          );
        },
        1,
        5000
      );

      if (!modeResult.success) {
        throw new LiveViewError("Failed to enable EVF mode", {
          operation: "startLiveView",
        });
      }

      // Step 5: Create and start live view engine
      this.liveViewEngine = new LiveViewEngine(sdk, cameraRef, {
        targetFps: 30,
        bufferSize: 2,
      });

      await this.liveViewEngine.start();

      // Transition to LIVEVIEW state
      await this.transitionTo("LIVEVIEW");

      cameraLogger.info("CameraStateManager: Live view started successfully");
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async stopLiveView(): Promise<void> {
    this.assertState(["LIVEVIEW"]);
    await this.transitionTo("EXITING_LIVEVIEW");

    try {
      if (!this.sessionManager) {
        throw new CameraNotInitializedError("stopLiveView");
      }

      // Step 1: Stop live view engine
      if (this.liveViewEngine) {
        await this.liveViewEngine.stop();
        this.liveViewEngine = null;
      }

      const sdk = this.sessionManager.getSdk();
      const cameraRef = this.sessionManager.getCameraRef();

      // Step 2: Set Output Device back to TFT
      cameraLogger.debug("CameraStateManager: Setting EVF OutputDevice to TFT");
      await this.setProperty(
        C.kEdsPropID_Evf_OutputDevice,
        C.kEdsEvfOutputDevice_TFT
      );

      // Step 3: Wait for confirmation
      await this.stateSynchronizer.waitForProperty(
        async () => {
          return await this.stateSynchronizer.getPropertyWithRetry(
            sdk.EdsGetPropertyData.bind(sdk),
            cameraRef,
            C.kEdsPropID_Evf_OutputDevice
          );
        },
        C.kEdsEvfOutputDevice_TFT,
        2000
      );

      // Step 4: Disable EVF Mode
      cameraLogger.debug("CameraStateManager: Disabling EVF Mode");
      await this.setProperty(C.kEdsPropID_Evf_Mode, 0);

      // Step 5: Wait for confirmation
      await this.stateSynchronizer.waitForProperty(
        async () => {
          return await this.stateSynchronizer.getPropertyWithRetry(
            sdk.EdsGetPropertyData.bind(sdk),
            cameraRef,
            C.kEdsPropID_Evf_Mode
          );
        },
        0,
        3000
      );

      // Transition back to CONNECTED
      await this.transitionTo("CONNECTED");

      cameraLogger.info("CameraStateManager: Live view stopped successfully");
    } catch (error) {
      await this.handleError(error);
      throw error;
    }
  }

  async getLiveViewFrame(): Promise<Buffer> {
    this.assertState(["LIVEVIEW"]);

    if (!this.liveViewEngine) {
      throw new LiveViewError("Live view engine not running", {
        operation: "getLiveViewFrame",
      });
    }

    const frame = await this.liveViewEngine.getFrame();

    if (!frame) {
      // Return empty buffer if no frame available
      return Buffer.alloc(0);
    }

    return frame.data;
  }

  isLiveViewActive(): boolean {
    return this.state === "LIVEVIEW";
  }

  getLiveViewStats() {
    if (!this.liveViewEngine) {
      return null;
    }
    return this.liveViewEngine.getStats();
  }

  // ============================================================================
  // Capture Operations
  // ============================================================================

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number
  ): Promise<CaptureResult> {
    this.assertState(["LIVEVIEW"]);
    await this.transitionTo("CAPTURING");

    return new Promise(async (resolve, reject) => {
      try {
        if (!this.sessionManager) {
          throw new CameraNotInitializedError("capturePhoto");
        }

        const sdk = this.sessionManager.getSdk();
        const cameraRef = this.sessionManager.getCameraRef();

        // Create output directory if needed
        if (!fs.existsSync(this.outputDirectory)) {
          fs.mkdirSync(this.outputDirectory, { recursive: true });
        }

        // Generate filename
        const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
        const outputPath = path.join(this.outputDirectory, filename);

        // Store pending capture info
        this.pendingCapture = {
          resolve,
          reject,
          sessionId,
          sequenceNumber,
          outputPath,
        };

        // Set timeout
        const timeoutMs = 30000; // 30 seconds
        const timeoutId = setTimeout(() => {
          this.pendingCapture = null;
          reject(
            new CaptureTimeoutError(timeoutMs, {
              operation: "capturePhoto",
              sessionId,
              sequenceNumber,
            })
          );
        }, timeoutMs);

        // Stop live view engine temporarily
        if (this.liveViewEngine) {
          await this.liveViewEngine.stop();
        }

        // Wait for camera to be ready
        const ready = await this.stateSynchronizer.waitForReady(
          sdk.EdsGetPropertyData.bind(sdk),
          cameraRef,
          5000
        );

        if (!ready) {
          clearTimeout(timeoutId);
          this.pendingCapture = null;
          throw new CameraNotReadyError("Camera busy, cannot capture", {
            operation: "capturePhoto",
            sessionId,
            sequenceNumber,
          });
        }

        // Press shutter button (non-AF to avoid focus delays)
        cameraLogger.info("CameraStateManager: Triggering capture");
        const shutterErr = sdk.EdsSendCommand(
          cameraRef,
          C.kEdsCameraCommand_PressShutterButton,
          C.kEdsCameraCommand_ShutterButton_Completely_NonAF
        );

        if (shutterErr !== C.EDS_ERR_OK) {
          clearTimeout(timeoutId);
          this.pendingCapture = null;

          // Restart live view engine
          if (this.liveViewEngine) {
            await this.liveViewEngine.start();
          }

          await this.transitionTo("LIVEVIEW");
          throw new CameraError(`Shutter command failed: ${shutterErr}`, {
            operation: "capturePhoto",
            sessionId,
            sequenceNumber,
          });
        }

        // Release shutter button after brief delay
        setTimeout(() => {
          try {
            sdk.EdsSendCommand(
              cameraRef,
              C.kEdsCameraCommand_PressShutterButton,
              C.kEdsCameraCommand_ShutterButton_OFF
            );
          } catch (error) {
            cameraLogger.debug("CameraStateManager: Error releasing shutter", {
              error,
            });
          }
        }, 100);

        // The actual download will happen in the object event handler
        // when we receive DirItemRequestTransfer
      } catch (error) {
        this.pendingCapture = null;

        // Restart live view engine on error
        if (this.liveViewEngine) {
          await this.liveViewEngine.start();
        }

        await this.transitionTo("LIVEVIEW");
        reject(error);
      }
    });
  }

  // ============================================================================
  // Property Operations
  // ============================================================================

  async getProperty(propertyId: number): Promise<number | null> {
    if (!this.sessionManager) {
      return null;
    }

    const sdk = this.sessionManager.getSdk();
    const cameraRef = this.sessionManager.getCameraRef();

    return await this.stateSynchronizer.getPropertyWithRetry(
      sdk.EdsGetPropertyData.bind(sdk),
      cameraRef,
      propertyId
    );
  }

  async setProperty(propertyId: number, value: number): Promise<void> {
    if (!this.sessionManager) {
      throw new CameraNotInitializedError("setProperty");
    }

    const sdk = this.sessionManager.getSdk();
    const cameraRef = this.sessionManager.getCameraRef();

    const data = Buffer.alloc(4);
    data.writeUInt32LE(value);

    const err = sdk.EdsSetPropertyData(cameraRef, propertyId, 0, 4, data);

    if (err !== C.EDS_ERR_OK) {
      throw new CameraError(
        `Failed to set property 0x${propertyId.toString(16)}: ${err}`,
        { operation: "setProperty" }
      );
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handleObjectEvent(event: number, ref: any): void {
    cameraLogger.debug(`CameraStateManager: Object event 0x${event.toString(16)}`);

    if (event === C.kEdsObjectEvent_DirItemRequestTransfer) {
      // A file is ready to be transferred
      this.handleFileTransferRequest(ref);
    }
  }

  private handlePropertyEvent(propertyId: number, value: any): void {
    cameraLogger.debug(
      `CameraStateManager: Property event 0x${propertyId.toString(16)} = ${value}`
    );
  }

  private handleStateEvent(event: number, param: number): void {
    cameraLogger.debug(
      `CameraStateManager: State event 0x${event.toString(16)}, param ${param}`
    );

    if (event === C.kEdsStateEvent_Shutdown) {
      cameraLogger.warn("CameraStateManager: Camera shutdown requested");
      this.handleError(new CameraError("Camera shutdown requested", {}));
    } else if (event === C.kEdsStateEvent_WillSoonShutDown) {
      // Extend shutdown timer
      this.extendShutDownTimer();
    }
  }

  private async handleFileTransferRequest(dirItemRef: any): Promise<void> {
    if (!this.pendingCapture || !this.sessionManager) {
      cameraLogger.warn(
        "CameraStateManager: File transfer request but no pending capture"
      );
      return;
    }

    const { resolve, reject, outputPath, sessionId, sequenceNumber } =
      this.pendingCapture;

    try {
      await this.transitionTo("DOWNLOADING");

      const sdk = this.sessionManager.getSdk();

      // Get file info
      const fileInfo: any = {};
      const infoErr = sdk.EdsGetDirectoryItemInfo(dirItemRef, fileInfo);

      if (infoErr !== C.EDS_ERR_OK) {
        throw new CameraError(`Failed to get file info: ${infoErr}`, {
          operation: "handleFileTransferRequest",
        });
      }

      cameraLogger.info(
        `CameraStateManager: Downloading file ${fileInfo.szFileName} (${fileInfo.size} bytes)`
      );

      // Create file stream
      const streamOut = [null];
      const streamErr = sdk.EdsCreateFileStream(
        outputPath,
        C.kEdsFileCreateDisposition_CreateAlways,
        C.kEdsAccess_ReadWrite,
        streamOut
      );

      if (streamErr !== C.EDS_ERR_OK) {
        throw new CameraError(`Failed to create file stream: ${streamErr}`, {
          operation: "handleFileTransferRequest",
        });
      }

      const stream = streamOut[0];

      try {
        // Download the file
        const downloadErr = sdk.EdsDownload(
          dirItemRef,
          fileInfo.size,
          stream
        );

        if (downloadErr !== C.EDS_ERR_OK) {
          // Cancel the download
          sdk.EdsDownloadCancel(dirItemRef);
          throw new CameraError(`Download failed: ${downloadErr}`, {
            operation: "handleFileTransferRequest",
          });
        }

        // Complete the download
        const completeErr = sdk.EdsDownloadComplete(dirItemRef);

        if (completeErr !== C.EDS_ERR_OK) {
          cameraLogger.warn(
            `CameraStateManager: EdsDownloadComplete returned ${completeErr}`
          );
        }

        cameraLogger.info(`CameraStateManager: Downloaded to ${outputPath}`);

        // Get metadata
        const metadata = await this.getCaptureMetadata();

        // Update statistics
        this.captureCount++;
        this.lastCaptureAt = new Date().toISOString();

        // Build result
        const result: CaptureResult = {
          filePath: outputPath,
          metadata,
        };

        // Clear pending capture
        this.pendingCapture = null;

        // Emit capture complete event
        this.emit({
          type: "captureComplete",
          filePath: outputPath,
          metadata,
        });

        // Restart live view engine
        if (this.liveViewEngine) {
          await this.liveViewEngine.start();
        }

        // Transition back to LIVEVIEW
        await this.transitionTo("LIVEVIEW");

        // Resolve the promise
        resolve(result);
      } finally {
        // Release stream
        sdk.EdsRelease(stream);
      }
    } catch (error) {
      // Clear pending capture
      this.pendingCapture = null;

      // Restart live view engine on error
      if (this.liveViewEngine) {
        await this.liveViewEngine.start();
      }

      // Transition back to LIVEVIEW
      await this.transitionTo("LIVEVIEW");

      // Reject the promise
      reject(error);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private async handleError(error: any): Promise<void> {
    const cameraError =
      error instanceof CameraError
        ? error
        : new CameraError(error instanceof Error ? error.message : String(error), {});

    cameraLogger.error("CameraStateManager: Error occurred", { error: cameraError });

    this.emit({
      type: "error",
      error: cameraError,
      fatal: true,
    });

    // Transition to error state
    this.state = "ERROR";
    this.stateHistory.push({ state: "ERROR", timestamp: Date.now() });
  }

  private async extendShutDownTimer(): Promise<void> {
    if (!this.sessionManager) return;

    try {
      const sdk = this.sessionManager.getSdk();
      const cameraRef = this.sessionManager.getCameraRef();

      sdk.EdsSendCommand(
        cameraRef,
        C.kEdsCameraCommand_ExtendShutDownTimer,
        0
      );
    } catch (error) {
      cameraLogger.debug("CameraStateManager: Failed to extend shutdown timer", {
        error,
      });
    }
  }

  private async getCaptureMetadata(): Promise<CaptureMetadata> {
    if (!this.sessionManager) {
      return {
        model: "Unknown",
        timestamp: new Date().toISOString(),
      };
    }

    const model = this.sessionManager.getCameraModel();
    const iso = await this.getProperty(C.kEdsPropID_ISOSpeed);
    const tv = await this.getProperty(C.kEdsPropID_Tv);
    const av = await this.getProperty(C.kEdsPropID_Av);

    return {
      model,
      timestamp: new Date().toISOString(),
      iso: iso?.toString(),
      shutterSpeed: tv?.toString(),
      aperture: av?.toString(),
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ============================================================================
  // Status
  // ============================================================================

  getStatus(): {
    state: CameraState;
    isLiveViewActive: boolean;
    captureCount: number;
    lastCaptureAt: string | null;
  } {
    return {
      state: this.state,
      isLiveViewActive: this.isLiveViewActive(),
      captureCount: this.captureCount,
      lastCaptureAt: this.lastCaptureAt,
    };
  }
}

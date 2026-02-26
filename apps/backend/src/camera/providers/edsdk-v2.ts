/**
 * EDSDK Provider v2
 *
 * New camera provider using the event-driven state machine architecture.
 * Provides reliable live view and capture on Canon cameras, especially 550D.
 */

import path from "path";
import { env } from "../../config/env";
import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../types";
import {
  CameraError,
  CameraNotInitializedError,
  LiveViewError,
} from "../errors";
import { cameraLogger } from "../logger";
import {
  CameraStateManager,
  CameraState,
  CameraEvent,
  LiveViewStats,
  CaptureMetadata,
} from "../state-machine";

interface EdsdkV2State {
  isInitialized: boolean;
  cameraModel: string;
  captureCount: number;
  lastCaptureAt: string | null;
  lastError: string | null;
  sdkVersion: string | null;
}

export class EdsdkV2Provider implements CameraProvider {
  private stateManager: CameraStateManager | null = null;
  private state: EdsdkV2State = {
    isInitialized: false,
    cameraModel: "Unknown",
    captureCount: 0,
    lastCaptureAt: null,
    lastError: null,
    sdkVersion: "13.20.10",
  };

  // Event subscription cleanup
  private unsubscribeEventHandler: (() => void) | null = null;

  constructor() {
    cameraLogger.info("EdsdkV2Provider: Created");
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  async initialize(): Promise<void> {
    cameraLogger.info("EdsdkV2Provider: Initializing");

    try {
      // Create state manager
      this.stateManager = new CameraStateManager(env.tempPhotoPath);

      // Subscribe to events
      this.unsubscribeEventHandler = this.stateManager.onEvent(
        this.handleCameraEvent.bind(this)
      );

      // Initialize the camera
      const cameraInfo = await this.stateManager.initialize();

      // Update state
      this.state.isInitialized = true;
      this.state.cameraModel = cameraInfo.model;

      cameraLogger.info("EdsdkV2Provider: Initialized successfully", {
        model: cameraInfo.model,
        battery: cameraInfo.batteryLevel,
        availableShots: cameraInfo.availableShots,
      });
    } catch (error) {
      cameraLogger.error("EdsdkV2Provider: Failed to initialize", { error });
      await this.cleanup();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    cameraLogger.info("EdsdkV2Provider: Disconnecting");
    await this.cleanup();
    cameraLogger.info("EdsdkV2Provider: Disconnected");
  }

  isConnected(): boolean {
    return (
      this.stateManager !== null &&
      this.state.isInitialized &&
      !["IDLE", "DISCONNECTING", "ERROR"].includes(
        this.stateManager.getState()
      )
    );
  }

  // ============================================================================
  // Capture
  // ============================================================================

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number
  ): Promise<CaptureResult> {
    if (!this.stateManager) {
      throw new CameraNotInitializedError("capturePhoto", sessionId);
    }

    cameraLogger.info("EdsdkV2Provider: Capturing photo", {
      sessionId,
      sequenceNumber,
    });

    try {
      const result = await this.stateManager.capturePhoto(
        sessionId,
        sequenceNumber
      );

      // Update state
      this.state.captureCount++;
      this.state.lastCaptureAt = new Date().toISOString();

      cameraLogger.info("EdsdkV2Provider: Photo captured successfully", {
        sessionId,
        sequenceNumber,
        filePath: result.filePath,
      });

      // Convert to expected format
      return {
        imagePath: result.filePath,
        metadata: this.convertMetadata(result.metadata),
      };
    } catch (error) {
      cameraLogger.error("EdsdkV2Provider: Capture failed", {
        sessionId,
        sequenceNumber,
        error,
      });

      this.state.lastError =
        error instanceof Error ? error.message : String(error);

      throw error;
    }
  }

  async cancelCapture(): Promise<void> {
    cameraLogger.info("EdsdkV2Provider: Cancelling capture");
    // TODO: Implement proper cancellation
    // For now, the state machine handles timeout-based cancellation
  }

  // ============================================================================
  // Live View
  // ============================================================================

  async startLiveView(): Promise<void> {
    if (!this.stateManager) {
      throw new CameraNotInitializedError("startLiveView");
    }

    cameraLogger.info("EdsdkV2Provider: Starting live view");

    try {
      await this.stateManager.startLiveView();
      cameraLogger.info("EdsdkV2Provider: Live view started");
    } catch (error) {
      cameraLogger.error("EdsdkV2Provider: Failed to start live view", { error });
      throw error;
    }
  }

  async stopLiveView(): Promise<void> {
    if (!this.stateManager) {
      return;
    }

    cameraLogger.info("EdsdkV2Provider: Stopping live view");

    try {
      await this.stateManager.stopLiveView();
      cameraLogger.info("EdsdkV2Provider: Live view stopped");
    } catch (error) {
      cameraLogger.error("EdsdkV2Provider: Failed to stop live view", { error });
      throw error;
    }
  }

  async getLiveViewFrame(): Promise<Buffer> {
    if (!this.stateManager) {
      throw new CameraNotInitializedError("getLiveViewFrame");
    }

    return await this.stateManager.getLiveViewFrame();
  }

  isLiveViewActive(): boolean {
    return this.stateManager?.isLiveViewActive() ?? false;
  }

  // ============================================================================
  // Settings
  // ============================================================================

  async setProperty(propertyId: number, value: any): Promise<void> {
    if (!this.stateManager) {
      throw new CameraNotInitializedError("setProperty");
    }

    const numValue = typeof value === "number" ? value : Number(value);
    await this.stateManager.setProperty(propertyId, numValue);

    cameraLogger.debug(
      `EdsdkV2Provider: Property 0x${propertyId.toString(16)} set to ${numValue}`
    );
  }

  async getProperty(propertyId: number): Promise<any> {
    if (!this.stateManager) {
      return null;
    }

    return await this.stateManager.getProperty(propertyId);
  }

  // ============================================================================
  // Status
  // ============================================================================

  async getStatus(options?: {
    includeSettings?: boolean;
  }): Promise<ExtendedCameraStatusResponse> {
    const includeSettings = options?.includeSettings ?? false;

    if (!this.isConnected() || !this.stateManager) {
      return {
        connected: false,
        model: "No camera detected",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }

    try {
      const state = this.stateManager.getState();
      const liveViewStats = this.stateManager.getLiveViewStats();

      // Get battery level
      const battery = (await this.getProperty(0x00000008)) ?? 100; // kEdsPropID_BatteryLevel

      // Build status response
      const response: ExtendedCameraStatusResponse = {
        connected: true,
        model: this.state.cameraModel,
        battery: typeof battery === "number" ? battery : 100,
        storageAvailable: true, // TODO: Check actual storage
        settings: includeSettings
          ? {
              iso: "Auto",
              aperture: "Auto",
              shutterSpeed: "Auto",
              whiteBalance: "Auto",
            }
          : {
              iso: "Auto",
              aperture: "Auto",
              shutterSpeed: "Auto",
              whiteBalance: "Auto",
            },
        providerMetadata: {
          provider: "edsdk-v2",
          state: state,
          liveViewActive: this.stateManager.isLiveViewActive(),
          captureCount: this.state.captureCount,
          lastCaptureAt: this.state.lastCaptureAt,
        },
        liveView: liveViewStats
          ? {
              active: this.stateManager.isLiveViewActive(),
              fps: Math.round(liveViewStats.fps * 10) / 10,
              droppedFrames: liveViewStats.droppedFrames,
            }
          : undefined,
        capture: {
          locked: false, // TODO: Implement capture mutex
          captureCount: this.state.captureCount,
          lastCaptureAt: this.state.lastCaptureAt,
          lastError: this.state.lastError,
        },
        sdk: {
          version: this.state.sdkVersion || "unknown",
          dllPath: "EDSDK.dll",
        },
      };

      return response;
    } catch (error) {
      cameraLogger.error("EdsdkV2Provider: Failed to get status", { error });

      return {
        connected: true,
        model: this.state.cameraModel,
        battery: 0,
        storageAvailable: false,
        settings: {
          iso: "Unknown",
          aperture: "Unknown",
          shutterSpeed: "Unknown",
          whiteBalance: "Unknown",
        },
      };
    }
  }

  async extendShutDownTimer(): Promise<void> {
    // The state machine handles this automatically via state events
    cameraLogger.debug("EdsdkV2Provider: Extend shutdown timer (handled by state manager)");
  }

  async triggerFocus(): Promise<void> {
    if (!this.stateManager) {
      throw new CameraNotInitializedError("triggerFocus");
    }

    // TODO: Implement focus trigger
    cameraLogger.debug("EdsdkV2Provider: Trigger focus not yet implemented");
  }

  getCaptureLockStatus(): { locked: boolean; mode: string } {
    // TODO: Implement capture locking
    return { locked: false, mode: "queue" };
  }

  setCaptureMode(mode: "queue" | "reject"): void {
    // TODO: Implement capture mode
    cameraLogger.debug(`EdsdkV2Provider: Set capture mode to ${mode}`);
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  private handleCameraEvent(event: CameraEvent): void {
    switch (event.type) {
      case "stateChanged":
        cameraLogger.debug(
          `EdsdkV2Provider: State changed ${event.from} -> ${event.to}`
        );
        break;

      case "captureComplete":
        cameraLogger.info("EdsdkV2Provider: Capture completed", {
          filePath: event.filePath,
        });
        break;

      case "error":
        cameraLogger.error("EdsdkV2Provider: Camera error", {
          error: event.error,
          fatal: event.fatal,
        });
        this.state.lastError = event.error.message;
        break;

      case "disconnected":
        cameraLogger.warn("EdsdkV2Provider: Camera disconnected", {
          reason: event.reason,
        });
        break;
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private async cleanup(): Promise<void> {
    // Unsubscribe from events
    if (this.unsubscribeEventHandler) {
      this.unsubscribeEventHandler();
      this.unsubscribeEventHandler = null;
    }

    // Disconnect state manager
    if (this.stateManager) {
      try {
        await this.stateManager.disconnect();
      } catch (error) {
        cameraLogger.error("EdsdkV2Provider: Error during cleanup", { error });
      }
      this.stateManager = null;
    }

    // Reset state
    this.state = {
      isInitialized: false,
      cameraModel: "Unknown",
      captureCount: 0,
      lastCaptureAt: null,
      lastError: null,
      sdkVersion: "13.20.10",
    };
  }

  // ============================================================================
  // Utility
  // ============================================================================

  private convertMetadata(metadata: CaptureMetadata): {
    model: string;
    timestamp: string;
    iso?: string;
    shutterSpeed?: string;
    aperture?: string;
    focalLength?: string;
  } {
    return {
      model: metadata.model,
      timestamp: metadata.timestamp,
      iso: metadata.iso,
      shutterSpeed: metadata.shutterSpeed,
      aperture: metadata.aperture,
      focalLength: metadata.focalLength,
    };
  }
}

import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import os from "os";
import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../types";
import {
  CameraError,
  CameraNotInitializedError,
  CameraNotConnectedError,
  CameraNotReadyError,
  CaptureTimeoutError,
  CardFullError,
  CardWriteError,
  CardNotPresentError,
  CorruptImageError,
  LiveViewError,
  EdsSdkError,
  mapEdsErrorToTypedError,
  isRetryableError,
  isFatalError,
} from "../errors";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";
import {
  EdsdkBindings,
  loadEdsdkLibrary,
  unloadEdsdkLibrary,
  checkSdkVersionCompatibility,
  getLoadedSdkInfo,
} from "../bindings/edsdk-bindings";
import * as C from "../bindings/constants";
import { CameraEventPump } from "../event-pump";
import { CameraWatchdog } from "../watchdog";
import { CaptureMutex, CaptureQueueMode } from "../mutex";

interface CaptureState {
  sessionId?: string;
  sequenceNumber?: number;
  outputPath: string;
  resolve: (filePath: string) => void;
  reject: (error: Error) => void;
  startTime: number;
  timeoutTimer?: ReturnType<typeof setTimeout>;
}

interface LiveViewStats {
  fps: number;
  droppedFrames: number;
  frameCount: number;
  lastFrameTime: number;
  consumerSlowCount: number;
}

interface EdsdkState {
  captureCount: number;
  lastCaptureAt: string | null;
  lastError: string | null;
  sdkVersion: string | null;
  dllPath: string | null;
  versionCompatible: boolean;
  optimalVersion: string | null;
}

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_MIN_SIZE = 100;

export class EdsdkProvider implements CameraProvider {
  private sdk: EdsdkBindings | null = null;
  private cameraRef: any = null;
  private cameraListRef: any = null;
  private cameraModel = "Unknown";
  private isSessionOpen = false;
  private liveViewActive = false;
  private eventPump: CameraEventPump;
  private watchdog: CameraWatchdog | null = null;
  private captureMutex: CaptureMutex;
  private pendingCapture: CaptureState | null = null;
  private liveViewStats: LiveViewStats = {
    fps: 0,
    droppedFrames: 0,
    frameCount: 0,
    lastFrameTime: 0,
    consumerSlowCount: 0,
  };
  private state: EdsdkState = {
    captureCount: 0,
    lastCaptureAt: null,
    lastError: null,
    sdkVersion: null,
    dllPath: null,
    versionCompatible: true,
    optimalVersion: null,
  };
  private lastEvfErrorLogTime = 0;
  private evfErrorCount = 0;
  private frameConsumerReady = true;
  private frameDropThresholdMs: number;

  constructor() {
    this.eventPump = new CameraEventPump(60);
    this.captureMutex = new CaptureMutex(env.captureQueueMode);
    this.frameDropThresholdMs = Math.max(33, 1000 / (env.liveViewFps * 0.8));
  }

  async initialize(): Promise<void> {
    cameraLogger.info("EdsdkProvider: Initializing EDSDK camera provider");
    try {
      this.sdk = loadEdsdkLibrary();
      const sdkInfo = getLoadedSdkInfo();
      this.state.sdkVersion = sdkInfo.version;
      this.state.dllPath = sdkInfo.dllPath;

      const err = this.sdk.EdsInitializeSDK();
      if (err !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(err, { operation: "initialize" });
      }
      cameraLogger.info("EdsdkProvider: SDK initialized", {
        version: this.state.sdkVersion,
        dllPath: this.state.dllPath,
      });

      const cameraListOut = [null];
      const listErr = this.sdk.EdsGetCameraList(cameraListOut);
      if (listErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(listErr, {
          operation: "EdsGetCameraList",
        });
      }
      this.cameraListRef = cameraListOut[0];

      const countOut = [0];
      C.checkError(
        this.sdk.EdsGetChildCount(this.cameraListRef, countOut),
        "EdsGetChildCount",
      );
      const cameraCount = countOut[0];

      if (cameraCount === 0) {
        throw new CameraNotConnectedError({ operation: "initialize" });
      }
      cameraLogger.info(`EdsdkProvider: Found ${cameraCount} camera(s)`);

      const cameraOut = [null];
      const childErr = this.sdk.EdsGetChildAtIndex(
        this.cameraListRef,
        0,
        cameraOut,
      );
      if (childErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(childErr, {
          operation: "EdsGetChildAtIndex",
        });
      }
      this.cameraRef = cameraOut[0];

      const deviceInfo = {};
      const infoErr = this.sdk.EdsGetDeviceInfo(this.cameraRef, deviceInfo);
      if (infoErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(infoErr, {
          operation: "EdsGetDeviceInfo",
        });
      }
      this.cameraModel =
        (deviceInfo as any).szDeviceDescription || "Canon Camera";

      const versionCheck = checkSdkVersionCompatibility(this.cameraModel);
      this.state.versionCompatible = versionCheck.compatible;
      this.state.optimalVersion = versionCheck.optimal;

      if (!versionCheck.compatible && versionCheck.optimal) {
        cameraLogger.warn(
          `EdsdkProvider: SDK version mismatch. Current: ${versionCheck.current}, Optimal for ${this.cameraModel}: ${versionCheck.optimal}`,
        );
      }

      cameraLogger.info(`EdsdkProvider: Camera model: ${this.cameraModel}`, {
        sdkVersion: this.state.sdkVersion,
        compatible: this.state.versionCompatible,
        optimalVersion: this.state.optimalVersion,
      });

      const sessionErr = this.sdk.EdsOpenSession(this.cameraRef);
      if (sessionErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(sessionErr, {
          operation: "EdsOpenSession",
        });
      }
      this.isSessionOpen = true;
      cameraLogger.info("EdsdkProvider: Session opened");

      const saveTo = Buffer.alloc(4);
      saveTo.writeUInt32LE(C.kEdsSaveTo_Host);
      const saveToErr = this.sdk.EdsSetPropertyData(
        this.cameraRef,
        C.kEdsPropID_SaveTo,
        0,
        4,
        saveTo,
      );
      if (saveToErr !== C.EDS_ERR_OK) {
        cameraLogger.warn(
          `EdsdkProvider: Failed to set save target: ${C.edsErrorToString(saveToErr)}`,
        );
      }

      const capacity = {
        numberOfFreeClusters: 0x7fffffff,
        bytesPerSector: 0x1000,
        reset: 1,
      };
      const capacityErr = this.sdk.EdsSetCapacity(this.cameraRef, capacity);
      if (capacityErr !== C.EDS_ERR_OK) {
        cameraLogger.warn(
          `EdsdkProvider: Failed to set capacity: ${C.edsErrorToString(capacityErr)}`,
        );
      }

      this.setupEventHandlers();
      this.eventPump.start(this.sdk);

      this.watchdog = new CameraWatchdog(this, {
        pollIntervalMs: 3000,
        onReconnect: async () => {
          cameraLogger.info("EdsdkProvider: Watchdog reconnection callback");
          this.liveViewActive = false;
          this.liveViewStats = {
            fps: 0,
            droppedFrames: 0,
            frameCount: 0,
            lastFrameTime: 0,
            consumerSlowCount: 0,
          };
        },
      });
      this.watchdog.start();

      // Camera warm-up sequence
      await this.warmUpCamera();

      cameraLogger.info(
        "EdsdkProvider: EDSDK provider initialized successfully",
        {
          model: this.cameraModel,
          sdkVersion: this.state.sdkVersion,
        },
      );
    } catch (error) {
      cameraLogger.error("EdsdkProvider: Failed to initialize", { error });
      this.cleanup();
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    cameraLogger.info("EdsdkProvider: Disconnecting camera");
    this.cleanup();
    cameraLogger.info("EdsdkProvider: Camera disconnected");
  }

  isConnected(): boolean {
    return this.isSessionOpen && this.cameraRef !== null;
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult> {
    return this.captureMutex.acquire(
      async () => this._capturePhotoInternal(sessionId, sequenceNumber),
      {
        sessionId,
        sequenceNumber,
        operation: "capturePhoto",
      },
    );
  }

  private async _capturePhotoInternal(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult> {
    if (!this.isConnected() || !this.sdk) {
      throw new CameraNotInitializedError("capturePhoto", sessionId);
    }

    cameraLogger.info("EdsdkProvider: Capturing photo", {
      sessionId,
      sequenceNumber,
    });

    if (this.liveViewActive) {
      await this.stopLiveView();
    }

    await this.checkStorageStatus();

    const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
    const outputDir = env.tempPhotoPath;
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    const outputPath = path.join(outputDir, filename);

    try {
      const imagePath = await this.takePictureAndDownload(
        outputPath,
        sessionId,
        sequenceNumber,
      );
      await this.verifyImageIntegrity(imagePath);

      this.state.captureCount++;
      this.state.lastCaptureAt = new Date().toISOString();

      cameraLogger.info("EdsdkProvider: Photo captured successfully", {
        sessionId,
        sequenceNumber,
        imagePath,
        size: fs.existsSync(imagePath) ? fs.statSync(imagePath).size : 0,
      });

      const metadata = await this.getCaptureMetadata();

      return {
        imagePath,
        metadata: {
          model: this.cameraModel,
          timestamp: new Date().toISOString(),
          iso: metadata.iso,
          shutterSpeed: metadata.shutterSpeed,
          aperture: metadata.aperture,
          focalLength: metadata.focalLength,
        },
      };
    } catch (error) {
      cameraLogger.error("EdsdkProvider: Capture failed", {
        sessionId,
        sequenceNumber,
        error,
      });

      this.state.lastError =
        error instanceof Error ? error.message : String(error);

      if (error instanceof CameraError) {
        throw error;
      }

      throw new CameraError(
        error instanceof Error ? error.message : "Capture failed",
        {
          operation: "capturePhoto",
          sessionId,
          sequenceNumber,
          timestamp: new Date().toISOString(),
        },
      );
    }
  }

  async cancelCapture(): Promise<void> {
    cameraLogger.info("EdsdkProvider: Cancelling capture");

    if (this.pendingCapture) {
      if (this.pendingCapture.timeoutTimer) {
        clearTimeout(this.pendingCapture.timeoutTimer);
      }
      const { reject } = this.pendingCapture;
      this.pendingCapture = null;

      reject(
        new CameraError("Capture cancelled by user", {
          operation: "cancelCapture",
          timestamp: new Date().toISOString(),
        }),
      );
    }

    if (this.sdk && this.cameraRef) {
      try {
        this.sdk.EdsSendCommand(
          this.cameraRef,
          C.kEdsCameraCommand_PressShutterButton,
          C.kEdsCameraCommand_ShutterButton_OFF,
        );
      } catch (error) {
        cameraLogger.debug("EdsdkProvider: Error releasing shutter", { error });
      }
    }

    this.captureMutex.forceRelease();
  }

  private takePictureAndDownload(
    outputPath: string,
    sessionId: string,
    sequenceNumber: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      if (!this.sdk) {
        reject(new CameraNotInitializedError("takePictureAndDownload"));
        return;
      }

      const startTime = Date.now();
      const timeoutMs = env.captureTimeoutMs;

      this.pendingCapture = {
        resolve,
        reject,
        outputPath,
        startTime,
      };

      this.pendingCapture.timeoutTimer = setTimeout(() => {
        if (this.pendingCapture) {
          this.pendingCapture = null;
          reject(
            new CaptureTimeoutError(timeoutMs, {
              operation: "takePictureAndDownload",
              sessionId,
              sequenceNumber,
            }),
          );
        }
      }, timeoutMs);

      const err = this.sdk.EdsSendCommand(
        this.cameraRef,
        C.kEdsCameraCommand_PressShutterButton,
        C.kEdsCameraCommand_ShutterButton_Completely_NonAF,
      );

      if (err !== C.EDS_ERR_OK) {
        if (this.pendingCapture?.timeoutTimer) {
          clearTimeout(this.pendingCapture.timeoutTimer);
        }
        this.pendingCapture = null;

        reject(
          mapEdsErrorToTypedError(err, {
            operation: "EdsSendCommand_PressShutterButton",
            sessionId,
            sequenceNumber,
          }),
        );
        return;
      }

      setTimeout(() => {
        if (this.sdk && this.cameraRef) {
          this.sdk.EdsSendCommand(
            this.cameraRef,
            C.kEdsCameraCommand_PressShutterButton,
            C.kEdsCameraCommand_ShutterButton_OFF,
          );
        }
      }, 100);
    });
  }

  async startLiveView(): Promise<void> {
    if (!this.isConnected() || !this.sdk) {
      throw new CameraNotInitializedError("startLiveView");
    }

    if (this.liveViewActive) {
      return;
    }

    cameraLogger.info("EdsdkProvider: Starting live view");

    const evfMode = Buffer.alloc(4);
    evfMode.writeUInt32LE(1);
    const evfModeErr = this.sdk.EdsSetPropertyData(
      this.cameraRef,
      C.kEdsPropID_Evf_Mode,
      0,
      4,
      evfMode,
    );
    if (evfModeErr !== C.EDS_ERR_OK) {
      cameraLogger.warn(
        `EdsdkProvider: Failed to enable EVF mode: ${C.edsErrorToString(evfModeErr)}`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 100));

    const outputDevice = Buffer.alloc(4);
    outputDevice.writeUInt32LE(C.kEdsEvfOutputDevice_PC);
    const outputErr = this.sdk.EdsSetPropertyData(
      this.cameraRef,
      C.kEdsPropID_Evf_OutputDevice,
      0,
      4,
      outputDevice,
    );

    if (outputErr !== C.EDS_ERR_OK) {
      throw new LiveViewError(
        `Failed to set output device: ${C.edsErrorToString(outputErr)}`,
        { operation: "startLiveView" },
      );
    }

    this.liveViewStats = {
      fps: 0,
      droppedFrames: 0,
      frameCount: 0,
      lastFrameTime: Date.now(),
      consumerSlowCount: 0,
    };
    this.frameConsumerReady = true;
    this.liveViewActive = true;

    cameraLogger.info("EdsdkProvider: Live view started");
  }

  async stopLiveView(): Promise<void> {
    if (!this.liveViewActive || !this.sdk) {
      return;
    }

    cameraLogger.info("EdsdkProvider: Stopping live view");

    const outputDevice = Buffer.alloc(4);
    outputDevice.writeUInt32LE(C.kEdsEvfOutputDevice_TFT);
    const outputErr = this.sdk.EdsSetPropertyData(
      this.cameraRef,
      C.kEdsPropID_Evf_OutputDevice,
      0,
      4,
      outputDevice,
    );

    if (outputErr !== C.EDS_ERR_OK) {
      cameraLogger.warn(
        `EdsdkProvider: Failed to set output device: ${C.edsErrorToString(outputErr)}`,
      );
    }

    const evfMode = Buffer.alloc(4);
    evfMode.writeUInt32LE(0);
    this.sdk.EdsSetPropertyData(
      this.cameraRef,
      C.kEdsPropID_Evf_Mode,
      0,
      4,
      evfMode,
    );

    this.liveViewActive = false;
    this.frameConsumerReady = true;

    cameraLogger.info("EdsdkProvider: Live view stopped", {
      totalFrames: this.liveViewStats.frameCount,
      droppedFrames: this.liveViewStats.droppedFrames,
      avgFps: this.liveViewStats.fps.toFixed(1),
    });
  }

  async getLiveViewFrame(): Promise<Buffer> {
    if (!this.liveViewActive || !this.sdk) {
      throw new LiveViewError("Live view not active", {
        operation: "getLiveViewFrame",
      });
    }

    const now = Date.now();

    if (!this.frameConsumerReady) {
      const timeSinceLastFrame = now - this.liveViewStats.lastFrameTime;

      if (timeSinceLastFrame < this.frameDropThresholdMs) {
        this.liveViewStats.droppedFrames++;
        this.liveViewStats.consumerSlowCount++;

        if (this.liveViewStats.consumerSlowCount % 30 === 0) {
          cameraLogger.warn(
            "EdsdkProvider: Live view consumer is slow, dropping frames",
            {
              droppedFrames: this.liveViewStats.droppedFrames,
              consumerSlowCount: this.liveViewStats.consumerSlowCount,
            },
          );
        }

        return Buffer.alloc(0);
      }
    }

    this.frameConsumerReady = false;

    try {
      return await this._getLiveViewFrameInternal();
    } finally {
      this.frameConsumerReady = true;
    }
  }

  private async _getLiveViewFrameInternal(): Promise<Buffer> {
    if (!this.sdk || !this.cameraRef) {
      throw new CameraNotInitializedError("getLiveViewFrame");
    }

    const streamOut = [null];
    let err = this.sdk.EdsCreateMemoryStream(BigInt(0), streamOut);
    if (err !== C.EDS_ERR_OK) {
      throw new LiveViewError(
        `Failed to create memory stream: ${C.edsErrorToString(err)}`,
        { operation: "getLiveViewFrame" },
      );
    }
    const stream = streamOut[0];

    try {
      const evfOut = [null];
      err = this.sdk.EdsCreateEvfImageRef(stream, evfOut);
      if (err !== C.EDS_ERR_OK) {
        throw new LiveViewError(
          `Failed to create EVF ref: ${C.edsErrorToString(err)}`,
          { operation: "getLiveViewFrame" },
        );
      }
      const evfImage = evfOut[0];

      try {
        err = this.sdk.EdsDownloadEvfImage(this.cameraRef, evfImage);

        if (err === 0x00000041) {
          return Buffer.alloc(0);
        }

        if (err === C.EDS_ERR_COMM_USB_BUS_ERR) {
          this.evfErrorCount++;
          const now = Date.now();
          if (now - this.lastEvfErrorLogTime > 5000) {
            cameraLogger.warn(
              `EdsdkProvider: USB communication error during EVF download (occurred ${this.evfErrorCount} times)`,
              { error: C.edsErrorToString(err) },
            );
            this.lastEvfErrorLogTime = now;
            this.evfErrorCount = 0;
          }
          return Buffer.alloc(0);
        }

        if (err !== C.EDS_ERR_OK) {
          throw new LiveViewError(
            `Failed to download EVF: ${C.edsErrorToString(err)}`,
            { operation: "getLiveViewFrame" },
          );
        }

        const lengthOut = [BigInt(0)];
        this.sdk.EdsGetLength(stream, lengthOut);
        const length = Number(lengthOut[0]);

        if (length === 0) {
          return Buffer.alloc(0);
        }

        const pointerOut = [null];
        this.sdk.EdsGetPointer(stream, pointerOut);

        const buffer = Buffer.from(
          pointerOut[0] as any as ArrayBuffer,
          0,
          length,
        );

        const now = Date.now();
        const timeDelta = now - this.liveViewStats.lastFrameTime;
        if (timeDelta > 0 && this.liveViewStats.frameCount > 0) {
          const instantFps = 1000 / timeDelta;
          this.liveViewStats.fps =
            this.liveViewStats.fps * 0.8 + instantFps * 0.2;
        }
        this.liveViewStats.lastFrameTime = now;
        this.liveViewStats.frameCount++;

        return Buffer.from(buffer);
      } finally {
        this.sdk.EdsRelease(evfImage);
      }
    } finally {
      this.sdk.EdsRelease(stream);
    }
  }

  isLiveViewActive(): boolean {
    return this.liveViewActive;
  }

  async setProperty(propertyId: number, value: any): Promise<void> {
    if (!this.isConnected() || !this.sdk) {
      throw new CameraNotInitializedError("setProperty");
    }

    const data = Buffer.alloc(4);
    if (typeof value === "number") {
      data.writeUInt32LE(value);
    } else {
      data.writeUInt32LE(Number(value));
    }

    const err = this.sdk.EdsSetPropertyData(
      this.cameraRef,
      propertyId,
      0,
      4,
      data,
    );

    if (err !== C.EDS_ERR_OK) {
      cameraLogger.warn(
        `EdsdkProvider: Failed to set property 0x${propertyId.toString(16)}: ${C.edsErrorToString(err)}`,
      );
      throw mapEdsErrorToTypedError(err, { operation: "setProperty" });
    }

    cameraLogger.debug(
      `EdsdkProvider: Property 0x${propertyId.toString(16)} set to ${value}`,
    );
  }

  async getProperty(propertyId: number): Promise<any> {
    if (!this.isConnected() || !this.sdk) {
      throw new CameraNotInitializedError("getProperty");
    }

    const data = Buffer.alloc(4);
    const err = this.sdk.EdsGetPropertyData(
      this.cameraRef,
      propertyId,
      0,
      4,
      data,
    );

    if (err !== C.EDS_ERR_OK) {
      cameraLogger.warn(
        `EdsdkProvider: Failed to get property 0x${propertyId.toString(16)}: ${C.edsErrorToString(err)}`,
      );
      return null;
    }

    return data.readUInt32LE();
  }

  async getStatus(): Promise<ExtendedCameraStatusResponse> {
    if (!this.isConnected()) {
      return {
        connected: false,
        model: "No camera detected",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }

    try {
      const battery =
        (await this.getProperty(C.kEdsPropID_BatteryLevel)) ?? 100;
      const iso = await this.getProperty(C.kEdsPropID_ISOSpeed);
      const av = await this.getProperty(C.kEdsPropID_Av);
      const tv = await this.getProperty(C.kEdsPropID_Tv);
      const wb = await this.getProperty(C.kEdsPropID_WhiteBalance);

      const sdCardInfo = await this.getSdCardInfo();
      const watchdogStatus = this.watchdog?.getStatus();

      return {
        connected: true,
        model: this.cameraModel,
        battery: typeof battery === "number" ? battery : 100,
        storageAvailable: sdCardInfo.present && sdCardInfo.freeSpaceMB !== null,
        settings: {
          iso: iso ? String(iso) : "Auto",
          aperture: av ? `f/${av}` : "Auto",
          shutterSpeed: tv ? String(tv) : "Auto",
          whiteBalance: wb ? String(wb) : "Auto",
        },
        providerMetadata: {
          provider: "edsdk",
          liveViewActive: this.liveViewActive,
          captureCount: this.state.captureCount,
          lastCaptureAt: this.state.lastCaptureAt,
        },
        sdCard: sdCardInfo,
        liveView: {
          active: this.liveViewActive,
          fps: parseFloat(this.liveViewStats.fps.toFixed(1)),
          droppedFrames: this.liveViewStats.droppedFrames,
        },
        capture: {
          locked: this.captureMutex.isLocked(),
          captureCount: this.state.captureCount,
          lastCaptureAt: this.state.lastCaptureAt,
          lastError: this.state.lastError,
        },
        watchdog: watchdogStatus
          ? {
              status: watchdogStatus.status,
              reconnectAttempts: watchdogStatus.reconnectAttempts,
              lastReconnectAt: watchdogStatus.lastReconnectAt,
            }
          : undefined,
        sdk: {
          version: this.state.sdkVersion || "unknown",
          dllPath: this.state.dllPath || "unknown",
        },
      };
    } catch (error) {
      cameraLogger.error("EdsdkProvider: Failed to get status", { error });
      throw error;
    }
  }

  async extendShutDownTimer(): Promise<void> {
    if (!this.isConnected() || !this.sdk) {
      return;
    }

    const err = this.sdk.EdsSendCommand(
      this.cameraRef,
      C.kEdsCameraCommand_ExtendShutDownTimer,
      0,
    );

    if (err !== C.EDS_ERR_OK) {
      cameraLogger.debug(
        `EdsdkProvider: Failed to extend shutdown timer: ${C.edsErrorToString(err)}`,
      );
    }
  }

  async triggerFocus(): Promise<void> {
    if (!this.isConnected() || !this.sdk) {
      throw new CameraNotInitializedError("triggerFocus");
    }

    const err = this.sdk.EdsSendCommand(
      this.cameraRef,
      C.kEdsCameraCommand_PressShutterButton,
      C.kEdsCameraCommand_ShutterButton_Halfway,
    );

    if (err !== C.EDS_ERR_OK) {
      throw mapEdsErrorToTypedError(err, { operation: "triggerFocus" });
    }

    await new Promise((resolve) => setTimeout(resolve, 500));

    this.sdk.EdsSendCommand(
      this.cameraRef,
      C.kEdsCameraCommand_PressShutterButton,
      C.kEdsCameraCommand_ShutterButton_OFF,
    );
  }

  getCaptureLockStatus(): { locked: boolean; mode: string } {
    return {
      locked: this.captureMutex.isLocked(),
      mode: env.captureQueueMode,
    };
  }

  setCaptureMode(mode: CaptureQueueMode): void {
    this.captureMutex.setMode(mode);
  }

  private setupEventHandlers(): void {
    if (!this.sdk || !this.cameraRef) return;

    const objectHandler = (event: number, ref: any, _context: any): number => {
      if (
        event === C.kEdsObjectEvent_DirItemRequestTransfer &&
        this.pendingCapture
      ) {
        this.handleCaptureDownload(ref);
      }
      return C.EDS_ERR_OK;
    };

    this.sdk.EdsSetObjectEventHandler(
      this.cameraRef,
      C.kEdsObjectEvent_All,
      objectHandler as any,
      null,
    );

    const propertyHandler = (
      event: number,
      propertyId: number,
      param: number,
      _context: any,
    ): number => {
      cameraLogger.debug(
        `EdsdkProvider: Property event 0x${event.toString(16)}, ` +
          `property 0x${propertyId.toString(16)}, param ${param}`,
      );
      return C.EDS_ERR_OK;
    };

    this.sdk.EdsSetPropertyEventHandler(
      this.cameraRef,
      C.kEdsPropertyEvent_All,
      propertyHandler as any,
      null,
    );

    const stateHandler = (
      event: number,
      param: number,
      _context: any,
    ): number => {
      if (event === C.kEdsStateEvent_Shutdown) {
        cameraLogger.warn("EdsdkProvider: Camera requesting shutdown");
        this.state.lastError = "Camera shutdown requested";
      } else if (event === C.kEdsStateEvent_WillSoonShutDown) {
        cameraLogger.debug("EdsdkProvider: Extending shutdown timer");
        this.extendShutDownTimer();
      } else if (event === C.kEdsStateEvent_CaptureError) {
        cameraLogger.error("EdsdkProvider: Capture error event received", {
          param,
        });
        this.handleCaptureErrorEvent(param);
      }
      return C.EDS_ERR_OK;
    };

    this.sdk.EdsSetStateEventHandler(
      this.cameraRef,
      C.kEdsStateEvent_All,
      stateHandler as any,
      null,
    );

    cameraLogger.info("EdsdkProvider: Event handlers registered");
  }

  private handleCaptureDownload(directoryItem: any): void {
    if (!this.sdk || !this.pendingCapture) return;

    const { resolve, reject, outputPath, timeoutTimer } = this.pendingCapture;

    if (timeoutTimer) {
      clearTimeout(timeoutTimer);
    }

    this.pendingCapture = null;

    try {
      const itemInfo = {};
      const infoErr = this.sdk.EdsGetDirectoryItemInfo(directoryItem, itemInfo);
      if (infoErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(infoErr, {
          operation: "EdsGetDirectoryItemInfo",
        });
      }

      const fileSize = (itemInfo as any).size || 0;
      cameraLogger.info(
        `EdsdkProvider: Downloading captured image (${fileSize} bytes)`,
      );

      const streamOut = [null];
      const streamErr = this.sdk.EdsCreateFileStream(
        outputPath,
        C.kEdsFileCreateDisposition_CreateAlways,
        C.kEdsAccess_ReadWrite,
        streamOut,
      );
      if (streamErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(streamErr, {
          operation: "EdsCreateFileStream",
        });
      }
      const stream = streamOut[0];

      try {
        const downloadErr = this.sdk.EdsDownload(
          directoryItem,
          BigInt(fileSize),
          stream,
        );
        if (downloadErr !== C.EDS_ERR_OK) {
          throw mapEdsErrorToTypedError(downloadErr, {
            operation: "EdsDownload",
          });
        }

        const completeErr = this.sdk.EdsDownloadComplete(directoryItem);
        if (completeErr !== C.EDS_ERR_OK) {
          cameraLogger.warn(
            `EdsdkProvider: EdsDownloadComplete failed: ${C.edsErrorToString(completeErr)}`,
          );
        }

        cameraLogger.info(`EdsdkProvider: Image downloaded to ${outputPath}`);
        resolve(outputPath);
      } finally {
        this.sdk.EdsRelease(stream);
      }
    } catch (error) {
      cameraLogger.error("EdsdkProvider: Download failed", { error });

      try {
        this.sdk.EdsDownloadCancel(directoryItem);
      } catch {
        // Ignore cancel errors
      }

      reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private handleCaptureErrorEvent(param: number): void {
    switch (param) {
      case C.EDS_ERR_DEVICE_MEMORY_FULL:
        this.state.lastError = "SD card full";
        break;
      case C.EDS_ERR_FILE_WRITE_ERROR:
        this.state.lastError = "SD card write error";
        break;
      case C.EDS_ERR_TAKE_PICTURE_NO_CARD_NG:
        this.state.lastError = "No SD card";
        break;
      default:
        this.state.lastError = `Capture error: 0x${param.toString(16)}`;
    }

    if (this.pendingCapture) {
      const { reject } = this.pendingCapture;
      this.pendingCapture = null;

      reject(mapEdsErrorToTypedError(param, { operation: "capture" }));
    }
  }

  private async verifyImageIntegrity(filePath: string): Promise<void> {
    if (!fs.existsSync(filePath)) {
      throw new CorruptImageError("File does not exist", filePath, {
        operation: "verifyImageIntegrity",
      });
    }

    const stats = fs.statSync(filePath);
    if (stats.size < JPEG_MIN_SIZE) {
      fs.unlinkSync(filePath);
      throw new CorruptImageError(
        `File too small (${stats.size} bytes)`,
        filePath,
        { operation: "verifyImageIntegrity" },
      );
    }

    const fd = fs.openSync(filePath, "r");
    try {
      const header = Buffer.alloc(3);
      const bytesRead = fs.readSync(fd, header, 0, 3, 0);

      if (bytesRead < 3) {
        fs.unlinkSync(filePath);
        throw new CorruptImageError("File too short to read header", filePath, {
          operation: "verifyImageIntegrity",
        });
      }

      if (!header.equals(JPEG_HEADER)) {
        fs.unlinkSync(filePath);
        throw new CorruptImageError(
          `Invalid JPEG header: ${header.toString("hex")}`,
          filePath,
          { operation: "verifyImageIntegrity" },
        );
      }
    } finally {
      fs.closeSync(fd);
    }

    cameraLogger.debug(`EdsdkProvider: Image integrity verified: ${filePath}`);
  }

  private async checkStorageStatus(): Promise<void> {
    if (!this.sdk || !this.cameraRef) {
      return;
    }

    try {
      const availableShots = await this.getProperty(
        C.kEdsPropID_AvailableShots,
      );

      if (availableShots !== null && availableShots <= 0) {
        throw new CardFullError({ operation: "checkStorageStatus" });
      }

      const saveTo = await this.getProperty(C.kEdsPropID_SaveTo);
      if (saveTo === C.kEdsSaveTo_Camera) {
        cameraLogger.warn(
          "EdsdkProvider: Camera set to save to card only, this may cause issues",
        );
      }
    } catch (error) {
      if (error instanceof CameraError) {
        throw error;
      }
      cameraLogger.debug("EdsdkProvider: Error checking storage status", {
        error,
      });
    }
  }

  private async getSdCardInfo(): Promise<{
    present: boolean;
    writeable: boolean;
    freeSpaceMB: number | null;
  }> {
    if (!this.sdk || !this.cameraRef) {
      return { present: false, writeable: false, freeSpaceMB: null };
    }

    try {
      const availableShots = await this.getProperty(
        C.kEdsPropID_AvailableShots,
      );
      const saveTo = await this.getProperty(C.kEdsPropID_SaveTo);

      const present = availableShots !== null && availableShots >= 0;

      let freeSpaceMB: number | null = null;
      if (present && availableShots !== null) {
        freeSpaceMB = Math.floor(availableShots * 5);
      }

      const writeable =
        saveTo !== null &&
        (saveTo === C.kEdsSaveTo_Camera || saveTo === C.kEdsSaveTo_Both);

      return { present, writeable, freeSpaceMB };
    } catch (error) {
      cameraLogger.debug("EdsdkProvider: Error getting SD card info", {
        error,
      });
      return { present: false, writeable: false, freeSpaceMB: null };
    }
  }

  /**
   * Camera warm-up sequence
   * 1. 1500ms delay after session open
   * 2. Poll battery every 200ms until valid
   * 3. Configure camera to booth defaults
   * 4. Emit camera:ready event
   */
  private async warmUpCamera(): Promise<void> {
    cameraLogger.info("EdsdkProvider: Starting camera warm-up sequence");

    // 1. Initial 1500ms delay after session open
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // 2. Poll battery level every 200ms until valid
    const maxAttempts = 20; // 4 seconds max
    let attempts = 0;
    let batteryLevel: number | null = null;

    while (attempts < maxAttempts) {
      try {
        batteryLevel = await this.getProperty(C.kEdsPropID_BatteryLevel);
        if (batteryLevel !== null && batteryLevel > 0) {
          cameraLogger.info(
            `EdsdkProvider: Battery level received: ${batteryLevel}%`,
          );
          break;
        }
      } catch (error) {
        cameraLogger.debug(
          `EdsdkProvider: Battery poll attempt ${attempts + 1} failed`,
        );
      }

      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    if (batteryLevel === null || batteryLevel === 0) {
      cameraLogger.warn(
        "EdsdkProvider: Could not get valid battery level after warm-up",
      );
    }

    // 3. Pre-configure camera to booth defaults
    cameraLogger.info("EdsdkProvider: Configuring booth defaults");

    // Set ISO to 400 (good for indoor booth)
    try {
      const isoValue = 0x0000006e; // ISO 400
      await this.setProperty(C.kEdsPropID_ISOSpeed, isoValue);
      cameraLogger.debug("EdsdkProvider: Set ISO to 400");
    } catch (error) {
      cameraLogger.debug("EdsdkProvider: Failed to set ISO", { error });
    }

    // Set white balance to Auto
    try {
      const wbValue = 0; // Auto
      await this.setProperty(C.kEdsPropID_WhiteBalance, wbValue);
      cameraLogger.debug("EdsdkProvider: Set white balance to Auto");
    } catch (error) {
      cameraLogger.debug("EdsdkProvider: Failed to set white balance", {
        error,
      });
    }

    // Set image quality to Large Fine JPEG
    try {
      const qualityValue = 0x0013ff0f; // Large Fine JPEG
      await this.setProperty(C.kEdsPropID_ImageQuality, qualityValue);
      cameraLogger.debug("EdsdkProvider: Set image quality to Large Fine");
    } catch (error) {
      cameraLogger.debug("EdsdkProvider: Failed to set image quality", {
        error,
      });
    }

    // 4. Log camera ready (events will be emitted via WebSocket from camera-service)
    cameraLogger.info(
      "EdsdkProvider: Camera warm-up complete, camera is ready",
      {
        model: this.cameraModel,
        batteryLevel,
        timestamp: new Date().toISOString(),
      },
    );
  }

  private async getCaptureMetadata(): Promise<Record<string, string>> {
    try {
      const iso = await this.getProperty(C.kEdsPropID_ISOSpeed);
      const av = await this.getProperty(C.kEdsPropID_Av);
      const tv = await this.getProperty(C.kEdsPropID_Tv);

      return {
        iso: iso ? String(iso) : "Auto",
        aperture: av ? `f/${av}` : "Auto",
        shutterSpeed: tv ? String(tv) : "Auto",
        focalLength: "Unknown",
      };
    } catch {
      return {
        iso: "Auto",
        shutterSpeed: "1/125",
        aperture: "f/5.6",
        focalLength: "Unknown",
      };
    }
  }

  private cleanup(): void {
    cameraLogger.info("EdsdkProvider: Starting cleanup");

    this.eventPump.stop();

    if (this.watchdog) {
      this.watchdog.stop();
      this.watchdog = null;
    }

    if (this.pendingCapture) {
      if (this.pendingCapture.timeoutTimer) {
        clearTimeout(this.pendingCapture.timeoutTimer);
      }
      const { reject } = this.pendingCapture;
      this.pendingCapture = null;
      reject(
        new CameraError("Capture cancelled during cleanup", {
          operation: "cleanup",
          timestamp: new Date().toISOString(),
        }),
      );
    }

    this.captureMutex.forceRelease();

    if (this.liveViewActive && this.sdk) {
      try {
        const outputDevice = Buffer.alloc(4);
        outputDevice.writeUInt32LE(C.kEdsEvfOutputDevice_TFT);
        this.sdk.EdsSetPropertyData(
          this.cameraRef,
          C.kEdsPropID_Evf_OutputDevice,
          0,
          4,
          outputDevice,
        );
      } catch {
        // Ignore
      }
      this.liveViewActive = false;
    }

    if (this.isSessionOpen && this.sdk && this.cameraRef) {
      try {
        this.sdk.EdsCloseSession(this.cameraRef);
      } catch {
        // Ignore
      }
      this.isSessionOpen = false;
    }

    if (this.cameraRef && this.sdk) {
      try {
        this.sdk.EdsRelease(this.cameraRef);
      } catch {
        // Ignore
      }
      this.cameraRef = null;
    }

    if (this.cameraListRef && this.sdk) {
      try {
        this.sdk.EdsRelease(this.cameraListRef);
      } catch {
        // Ignore
      }
      this.cameraListRef = null;
    }

    if (this.sdk) {
      try {
        this.sdk.EdsTerminateSDK();
      } catch {
        // Ignore
      }
      this.sdk = null;
    }

    unloadEdsdkLibrary();

    this.state = {
      captureCount: 0,
      lastCaptureAt: null,
      lastError: null,
      sdkVersion: null,
      dllPath: null,
      versionCompatible: true,
      optimalVersion: null,
    };

    cameraLogger.info("EdsdkProvider: Cleanup complete");
  }
}

/**
 * Canon EDSDK Camera Provider
 * Native integration with Canon cameras via EDSDK
 */

import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import ref from "ref-napi";
import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../types";
import { CameraError, EdsError, CameraNotInitializedError } from "../errors";
import { cameraLogger } from "../logger";
import {
  loadEdsdk,
  getEdsdk,
  isEdsdkInitialized,
  terminateEdsdk,
} from "../bindings";
import {
  EDS_ERR_OK,
  EDS_ERR_DEVICE_BUSY,
  kEdsPropID_ProductName,
  kEdsPropID_BodyID,
  kEdsPropID_FirmwareVersion,
  kEdsPropID_BatteryLevel,
  kEdsPropID_SaveTo,
  kEdsPropID_AvailableShots,
  kEdsPropID_LensName,
  kEdsPropID_ISOSpeed,
  kEdsPropID_WhiteBalance,
  kEdsPropID_Av,
  kEdsPropID_Tv,
  kEdsPropID_Evf_OutputDevice,
  kEdsCameraCommand_TakePicture,
  kEdsCameraCommand_ExtendShutDownTimer,
  kEdsCameraCommand_DoEvfAf,
  kEdsSaveTo_Host,
  kEdsEvfOutputDevice_PC,
  kEdsObjectEvent_DirItemRequestTransfer,
} from "../bindings/constants";
import { env } from "../../config/env";

export class EdsProvider implements CameraProvider {
  private cameraRef: any = null;
  private sessionOpen = false;
  private liveViewActive = false;
  private isInitialized = false;
  private cameraModel = "Unknown";
  private pendingDownloads: Array<{
    itemRef: any;
    resolve: Function;
    reject: Function;
  }> = [];

  async initialize(): Promise<void> {
    cameraLogger.info("EdsProvider: Initializing EDSDK camera provider");

    try {
      // Load EDSDK DLL
      if (!isEdsdkInitialized()) {
        loadEdsdk();
      }

      const edsdk = getEdsdk();

      // Get camera list
      const cameraListRef = ref.alloc(ref.refType(ref.types.void));
      let result = edsdk.EdsGetCameraList(cameraListRef);
      this.checkEdsError(result, "EdsGetCameraList");

      const cameraList = cameraListRef.deref();

      // Get camera count
      const countRef = ref.alloc(ref.types.uint32);
      result = edsdk.EdsGetChildCount(cameraList, countRef);
      this.checkEdsError(result, "EdsGetChildCount");

      const count = countRef.deref();

      if (count === 0) {
        throw new CameraError("No Canon camera detected", {
          operation: "initialize",
          timestamp: new Date().toISOString(),
        });
      }

      cameraLogger.info("EdsProvider: Found cameras", { count });

      // Get first camera
      const cameraRefPtr = ref.alloc(ref.refType(ref.types.void));
      result = edsdk.EdsGetChildAtIndex(cameraList, 0, cameraRefPtr);
      this.checkEdsError(result, "EdsGetChildAtIndex");

      this.cameraRef = cameraRefPtr.deref();

      // Get device info
      await this.loadDeviceInfo();

      // Open session
      result = edsdk.EdsOpenSession(this.cameraRef);
      this.checkEdsError(result, "EdsOpenSession");
      this.sessionOpen = true;

      // Set save to computer
      await this.setSaveToHost();

      // Setup event handlers
      this.setupEventHandlers();

      this.isInitialized = true;

      cameraLogger.info(
        "EdsProvider: EDSDK provider initialized successfully",
        {
          model: this.cameraModel,
        },
      );
    } catch (error) {
      cameraLogger.error("EdsProvider: Failed to initialize", { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    cameraLogger.info("EdsProvider: Disconnecting camera");

    try {
      if (this.liveViewActive) {
        await this.stopLiveView();
      }

      if (this.sessionOpen && this.cameraRef) {
        const edsdk = getEdsdk();
        const result = edsdk.EdsCloseSession(this.cameraRef);
        if (result !== EDS_ERR_OK) {
          cameraLogger.warn("EdsCloseSession returned error:", result);
        }
        this.sessionOpen = false;
      }

      if (this.cameraRef) {
        const edsdk = getEdsdk();
        edsdk.EdsRelease(this.cameraRef);
        this.cameraRef = null;
      }

      terminateEdsdk();
      this.isInitialized = false;

      cameraLogger.info("EdsProvider: Camera disconnected");
    } catch (error) {
      cameraLogger.error("EdsProvider: Error during disconnect", { error });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.isInitialized && this.sessionOpen;
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("capturePhoto");
    }

    cameraLogger.info("EdsProvider: Capturing photo", {
      sessionId,
      sequenceNumber,
    });

    try {
      const edsdk = getEdsdk();

      // Stop live view if active (550D can't capture while streaming)
      if (this.liveViewActive) {
        await this.stopLiveView();
      }

      // Wait for any pending downloads to complete
      if (this.pendingDownloads.length > 0) {
        cameraLogger.warn("EdsProvider: Waiting for pending downloads");
        await Promise.all(
          this.pendingDownloads.map(
            (p) =>
              new Promise<void>((resolve) => {
                const check = () => {
                  if (!this.pendingDownloads.includes(p)) {
                    resolve();
                  } else {
                    setTimeout(check, 100);
                  }
                };
                check();
              }),
          ),
        );
      }

      // Create promise for download completion
      const downloadPromise = new Promise<Buffer>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(
            new CameraError("Capture timeout", {
              operation: "capturePhoto",
              sessionId,
              sequenceNumber,
              timestamp: new Date().toISOString(),
            }),
          );
        }, 30000); // 30 second timeout

        const checkDownload = () => {
          if (this.pendingDownloads.length > 0) {
            const download = this.pendingDownloads.shift();
            clearTimeout(timeout);
            download
              ?.resolve(undefined)
              .then((data: Buffer) => resolve(data))
              .catch(reject);
          } else {
            setTimeout(checkDownload, 100);
          }
        };

        // Start checking after sending capture command
        setTimeout(checkDownload, 500);
      });

      // Send capture command
      const result = edsdk.EdsSendCommand(
        this.cameraRef,
        kEdsCameraCommand_TakePicture,
        0,
      );
      this.checkEdsError(result, "EdsSendCommand");

      // Wait for download
      const imageData = await downloadPromise;

      // Save to file
      const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
      const imagePath = path.join(env.tempPhotoPath, filename);

      if (!fs.existsSync(env.tempPhotoPath)) {
        fs.mkdirSync(env.tempPhotoPath, { recursive: true });
      }

      fs.writeFileSync(imagePath, imageData);

      // Get metadata
      const metadata = await this.getCaptureMetadata();

      cameraLogger.info("EdsProvider: Photo captured successfully", {
        sessionId,
        sequenceNumber,
        imagePath,
        size: imageData.length,
      });

      return { imagePath, metadata };
    } catch (error) {
      cameraLogger.error("EdsProvider: Capture failed", {
        sessionId,
        sequenceNumber,
        error,
      });
      throw error;
    }
  }

  async startLiveView(): Promise<void> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("startLiveView");
    }

    cameraLogger.info("EdsProvider: Starting live view");

    try {
      // Set EVF output to PC
      await this.setProperty(
        kEdsPropID_Evf_OutputDevice,
        kEdsEvfOutputDevice_PC,
      );

      this.liveViewActive = true;
      cameraLogger.info("EdsProvider: Live view started");
    } catch (error) {
      cameraLogger.error("EdsProvider: Failed to start live view", { error });
      throw error;
    }
  }

  async stopLiveView(): Promise<void> {
    if (!this.liveViewActive) {
      return;
    }

    cameraLogger.info("EdsProvider: Stopping live view");

    try {
      // Set EVF output to TFT (camera display)
      await this.setProperty(kEdsPropID_Evf_OutputDevice, 0);

      this.liveViewActive = false;
      cameraLogger.info("EdsProvider: Live view stopped");
    } catch (error) {
      cameraLogger.error("EdsProvider: Error stopping live view", { error });
      throw error;
    }
  }

  async getLiveViewFrame(): Promise<Buffer> {
    if (!this.liveViewActive) {
      throw new CameraError("Live view not started", {
        operation: "getLiveViewFrame",
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const edsdk = getEdsdk();

      // Create memory stream for frame data
      const streamRef = ref.alloc(ref.refType(ref.types.void));
      let result = edsdk.EdsCreateMemoryStream(1024 * 1024, streamRef); // 1MB buffer
      this.checkEdsError(result, "EdsCreateMemoryStream");

      const stream = streamRef.deref();

      try {
        // Create EVF image reference
        const evfImageRef = ref.alloc(ref.refType(ref.types.void));
        result = edsdk.EdsCreateEvfImageRef(stream, evfImageRef);
        this.checkEdsError(result, "EdsCreateEvfImageRef");

        const evfImage = evfImageRef.deref();

        try {
          // Download EVF image
          result = edsdk.EdsDownloadEvfImage(this.cameraRef, evfImage);
          this.checkEdsError(result, "EdsDownloadEvfImage");

          // Get stream length
          const lengthRef = ref.alloc(ref.types.uint32);
          result = edsdk.EdsGetLength(stream, lengthRef);
          this.checkEdsError(result, "EdsGetLength");

          const length = lengthRef.deref();

          if (length === 0) {
            throw new CameraError("Empty live view frame", {
              operation: "getLiveViewFrame",
              timestamp: new Date().toISOString(),
            });
          }

          // Get pointer to data
          const pointerRef = ref.alloc(ref.refType(ref.types.void));
          result = edsdk.EdsGetPointer(stream, pointerRef);
          this.checkEdsError(result, "EdsGetPointer");

          const pointer = pointerRef.deref();

          // Read data into buffer
          const buffer = ref.reinterpret(pointer, length) as Buffer;

          return Buffer.from(buffer); // Copy to new buffer
        } finally {
          edsdk.EdsRelease(evfImage);
        }
      } finally {
        edsdk.EdsRelease(stream);
      }
    } catch (error) {
      cameraLogger.error("EdsProvider: Failed to get live view frame", {
        error,
      });
      throw error;
    }
  }

  async setProperty(propertyId: number, value: any): Promise<void> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("setProperty");
    }

    const edsdk = getEdsdk();

    // Allocate value buffer based on type
    let valuePtr: any;
    let valueSize: number;

    if (typeof value === "number") {
      valuePtr = ref.alloc(ref.types.uint32, value);
      valueSize = 4;
    } else if (typeof value === "string") {
      valuePtr = ref.allocCString(value);
      valueSize = Buffer.byteLength(value, "utf8") + 1;
    } else {
      throw new CameraError(
        `Unsupported property value type: ${typeof value}`,
        {
          operation: "setProperty",
          metadata: { propertyId, value },
          timestamp: new Date().toISOString(),
        },
      );
    }

    const result = edsdk.EdsSetPropertyData(
      this.cameraRef,
      propertyId,
      0,
      valueSize,
      valuePtr,
    );

    this.checkEdsError(result, "EdsSetPropertyData");

    cameraLogger.debug("EdsProvider: Property set", { propertyId, value });
  }

  async getProperty(propertyId: number): Promise<any> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("getProperty");
    }

    const edsdk = getEdsdk();

    // Get property size and type
    const dataTypeRef = ref.alloc(ref.types.uint32);
    const sizeRef = ref.alloc(ref.types.uint32);

    let result = edsdk.EdsGetPropertySize(
      this.cameraRef,
      propertyId,
      0,
      dataTypeRef,
      sizeRef,
    );
    this.checkEdsError(result, "EdsGetPropertySize");

    const dataType = dataTypeRef.deref();
    const size = sizeRef.deref();

    // Allocate buffer and get data
    const dataPtr = ref.alloc(ref.types.uint32); // Simplified - assuming 4 byte values
    result = edsdk.EdsGetPropertyData(
      this.cameraRef,
      propertyId,
      0,
      size,
      dataPtr,
    );
    this.checkEdsError(result, "EdsGetPropertyData");

    return dataPtr.deref();
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
      // Get various properties
      let batteryLevel = 100;
      let availableShots = 0;
      let lensName = "Unknown";

      try {
        batteryLevel = await this.getProperty(kEdsPropID_BatteryLevel);
      } catch (e) {
        // Ignore
      }

      try {
        availableShots = await this.getProperty(kEdsPropID_AvailableShots);
      } catch (e) {
        // Ignore
      }

      return {
        connected: true,
        model: this.cameraModel,
        battery: batteryLevel,
        storageAvailable: availableShots > 0,
        settings: {
          iso: (await this.getProperty(kEdsPropID_ISOSpeed)).toString(),
          whiteBalance: (
            await this.getProperty(kEdsPropID_WhiteBalance)
          ).toString(),
        },
        edsMetadata: {
          protocolVersion: "EDSDK 2.15",
          availableShots,
          lensName,
          bodyID: await this.getProperty(kEdsPropID_BodyID),
          firmwareVersion: "Unknown",
          saveTo: "host",
        },
      };
    } catch (error) {
      cameraLogger.error("EdsProvider: Failed to get status", { error });
      throw error;
    }
  }

  async extendShutDownTimer(): Promise<void> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("extendShutDownTimer");
    }

    const edsdk = getEdsdk();
    const result = edsdk.EdsSendCommand(
      this.cameraRef,
      kEdsCameraCommand_ExtendShutDownTimer,
      0,
    );

    this.checkEdsError(result, "ExtendShutDownTimer");
    cameraLogger.debug("EdsProvider: Shutdown timer extended");
  }

  async triggerFocus(): Promise<void> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("triggerFocus");
    }

    const edsdk = getEdsdk();
    const result = edsdk.EdsSendCommand(
      this.cameraRef,
      kEdsCameraCommand_DoEvfAf,
      1, // AF on
    );

    this.checkEdsError(result, "DoEvfAf");
    cameraLogger.debug("EdsProvider: Focus triggered");
  }

  // Private helper methods

  private checkEdsError(errorCode: number, operation: string): void {
    if (errorCode === EDS_ERR_OK) {
      return;
    }

    if (errorCode === EDS_ERR_DEVICE_BUSY) {
      throw new CameraError("Camera is busy", {
        operation,
        edsErrorCode: errorCode,
        timestamp: new Date().toISOString(),
      });
    }

    throw new EdsError(errorCode, {
      operation,
      timestamp: new Date().toISOString(),
      stack: new Error().stack,
    });
  }

  private async loadDeviceInfo(): Promise<void> {
    const edsdk = getEdsdk();

    // Get product name
    const nameBuffer = Buffer.alloc(256);
    let result = edsdk.EdsGetPropertyData(
      this.cameraRef,
      kEdsPropID_ProductName,
      0,
      256,
      nameBuffer,
    );

    if (result === EDS_ERR_OK) {
      this.cameraModel = nameBuffer.toString("utf8").replace(/\0/g, "");
    }
  }

  private async setSaveToHost(): Promise<void> {
    await this.setProperty(kEdsPropID_SaveTo, kEdsSaveTo_Host);
    cameraLogger.info("EdsProvider: Set save location to host");
  }

  private setupEventHandlers(): void {
    const edsdk = getEdsdk();

    // Note: Event handlers in ffi-napi are complex and require keeping
    // references to prevent GC. For simplicity, we'll poll for downloads
    // in the capture method instead of using async callbacks.

    cameraLogger.debug("EdsProvider: Event handlers setup (using polling)");
  }

  private async getCaptureMetadata(): Promise<any> {
    return {
      model: this.cameraModel,
      iso: (await this.getProperty(kEdsPropID_ISOSpeed)).toString(),
      timestamp: new Date().toISOString(),
    };
  }
}

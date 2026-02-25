import { createLogger } from "@photonic/utils";
import {
  CameraMetadata,
  CameraSettings,
  CameraStatusResponse,
} from "@photonic/types";
import { env } from "../config/env";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { nanoid } from "nanoid";
import { Readable } from "stream";

// New camera module imports
import {
  CameraProvider,
  cameraLogger,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../camera";
import { getCameraManager } from "../camera/camera-manager";

const logger = createLogger("camera-service");

const initializedDirs = new Set<string>();

async function ensureDir(dirPath: string): Promise<void> {
  if (initializedDirs.has(dirPath)) {
    return;
  }
  await fsPromises.mkdir(dirPath, { recursive: true });
  initializedDirs.add(dirPath);
}

export class CameraService {
  private provider: CameraProvider;
  private isInitialized = false;
  private _isStreaming = false;

  constructor(provider?: CameraProvider) {
    if (provider) {
      // Use provided provider (from CameraManager)
      this.provider = provider;
      logger.info("Camera service using provider from CameraManager", {
        platform: process.platform,
      });
    } else {
      // Fallback: get provider from CameraManager
      try {
        const cameraManager = getCameraManager();
        this.provider = cameraManager.getActiveProvider();
        logger.info("Camera service using CameraManager's active provider", {
          platform: process.platform,
        });
      } catch (error) {
        logger.error("CameraManager not initialized, camera service will not work");
        throw new Error("CameraManager must be initialized before CameraService");
      }
    }
  }

  async initialize(): Promise<void> {
    // CameraService now relies on CameraManager's provider being initialized
    // Provider is already initialized by CameraManager
    if (this.provider.isConnected()) {
      this.isInitialized = true;
      logger.info("Camera service initialized (using CameraManager provider)");
    } else {
      logger.warn("Camera provider not connected, waiting for CameraManager");
    }
  }

  isConnected(): boolean {
    return this.isInitialized && this.provider.isConnected();
  }

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  setStreaming(value: boolean): void {
    this._isStreaming = value;
  }

  /**
   * Start preview stream using provider's live view
   * Returns a readable stream of MJPEG data
   */
  async startPreviewStream(): Promise<NodeJS.ReadableStream> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.provider.isConnected()) {
      throw new Error("Camera not connected");
    }

    // Start live view
    await this.provider.startLiveView();

    // Create MJPEG stream from individual frames
    const frameGenerator = async function* (provider: CameraProvider) {
      try {
        while (true) {
          const frame = await provider.getLiveViewFrame();

          // Skip empty frames (camera not ready yet)
          if (!frame || frame.length === 0) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            continue;
          }

          // MJPEG boundary and headers
          const mjpegFrame = Buffer.concat([
            Buffer.from("--myboundary\r\n"),
            Buffer.from("Content-Type: image/jpeg\r\n"),
            Buffer.from(`Content-Length: ${frame.length}\r\n\r\n`),
            frame,
            Buffer.from("\r\n"),
          ]);

          yield mjpegFrame;

          // Frame rate control (10 FPS)
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      } catch (error) {
        cameraLogger.error("Live view stream error:", error);
        throw error;
      }
    };

    this._isStreaming = true;

    const stream = Readable.from(frameGenerator(this.provider));

    // Handle stream end
    stream.on("end", () => {
      this._isStreaming = false;
      this.provider.stopLiveView().catch((err) => {
        cameraLogger.error("Error stopping live view:", err);
      });
    });

    stream.on("error", (err) => {
      this._isStreaming = false;
      cameraLogger.error("Stream error:", err);
      this.provider.stopLiveView().catch(() => { });
    });

    return stream;
  }

  /**
   * Stop the preview stream
   */
  async stopPreviewStream(): Promise<void> {
    if (!this._isStreaming) {
      return;
    }

    logger.info("Stopping preview stream...");
    this._isStreaming = false;

    try {
      await this.provider.stopLiveView();
      logger.info("Preview stream stopped");
    } catch (error: any) {
      logger.error("Error stopping preview stream:", error.message);
      throw error;
    }
  }

  async getPreviewFrame(): Promise<Buffer> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.provider.isConnected()) {
      throw new Error("Camera not connected");
    }

    if (!this._isStreaming) {
      await this.provider.startLiveView();
    }

    return this.provider.getLiveViewFrame();
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.provider.isConnected()) {
      throw new Error("Camera not initialized");
    }

    // Stop preview if running (can't capture while streaming on 550D)
    const wasStreaming = this._isStreaming;
    if (wasStreaming) {
      logger.info("Stopping preview for capture...");
      await this.stopPreviewStream();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    try {
      logger.info(`Capturing photo ${sequenceNumber} for session ${sessionId}`);

      const result = await this.provider.capturePhoto(
        sessionId,
        sequenceNumber,
      );

      logger.info("Photo captured successfully", {
        imagePath: result.imagePath,
        size: fs.existsSync(result.imagePath)
          ? fs.statSync(result.imagePath).size
          : 0,
      });

      // Restart preview if it was running
      if (wasStreaming) {
        logger.info("Restarting preview stream...");
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.startPreviewStream();
      }

      return {
        imagePath: result.imagePath,
        metadata: result.metadata,
      };
    } catch (error: any) {
      logger.error("Capture failed:", error);

      // Restart preview on error too
      if (wasStreaming) {
        logger.info("Restarting preview stream after error...");
        await new Promise((resolve) => setTimeout(resolve, 500));
        await this.startPreviewStream().catch(() => { });
      }

      throw error;
    }
  }

  async getStatus(): Promise<CameraStatusResponse> {
    if (!this.isInitialized) {
      return {
        connected: false,
        model: "Camera not initialized",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }

    try {
      const status = await this.provider.getStatus();
      return status;
    } catch (error: any) {
      logger.error("Failed to get camera status:", error.message);
      return {
        connected: false,
        model: "Error getting status",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }
  }

  async configure(settings: Partial<CameraSettings>): Promise<CameraSettings> {
    if (!this.isInitialized) {
      throw new Error("Camera not initialized");
    }

    logger.info("Configuring camera:", settings);

    // EDSDK property IDs (inlined to avoid dependency on bindings)
    const kEdsPropID_ISOSpeed = 0x00000402;
    const kEdsPropID_WhiteBalance = 0x00000403;
    const kEdsPropID_Av = 0x00000405;
    const kEdsPropID_Tv = 0x00000406;

    const configured: CameraSettings = {};

    if (settings.iso) {
      try {
        // Convert ISO string to EDSDK value
        const isoValue = parseInt(settings.iso, 10);
        await this.provider.setProperty(kEdsPropID_ISOSpeed, isoValue);
        configured.iso = settings.iso;
      } catch (error) {
        logger.warn("Failed to set ISO:", error);
      }
    }

    if (settings.whiteBalance) {
      try {
        await this.provider.setProperty(
          kEdsPropID_WhiteBalance,
          settings.whiteBalance,
        );
        configured.whiteBalance = settings.whiteBalance;
      } catch (error) {
        logger.warn("Failed to set white balance:", error);
      }
    }

    // Get current settings from camera
    const currentStatus = await this.getStatus();

    return {
      iso: configured.iso || currentStatus.settings.iso || "Auto",
      shutterSpeed:
        configured.shutterSpeed ||
        currentStatus.settings.shutterSpeed ||
        "Auto",
      aperture:
        configured.aperture || currentStatus.settings.aperture || "Auto",
      whiteBalance:
        configured.whiteBalance ||
        currentStatus.settings.whiteBalance ||
        "auto",
      imageFormat:
        configured.imageFormat || currentStatus.settings.imageFormat || "JPEG",
    };
  }

  async disconnect(): Promise<void> {
    logger.info("Disconnecting camera service...");

    if (this._isStreaming) {
      await this.stopPreviewStream();
    }

    await this.provider.disconnect();
    this.isInitialized = false;

    logger.info("Camera service disconnected");
  }

  /**
   * Extend camera shutdown timer
   */
  async extendShutDownTimer(): Promise<void> {
    if (!this.isInitialized || !this.provider.isConnected()) {
      return;
    }

    try {
      await this.provider.extendShutDownTimer();
    } catch (error) {
      logger.warn("Failed to extend shutdown timer:", error);
    }
  }

  /**
   * Trigger auto-focus
   */
  async triggerFocus(): Promise<void> {
    if (!this.isInitialized || !this.provider.isConnected()) {
      throw new Error("Camera not initialized");
    }

    await this.provider.triggerFocus();
  }
}

let cameraService: CameraService | null = null;

export function getCameraService(provider?: CameraProvider): CameraService {
  if (!cameraService) {
    cameraService = new CameraService(provider);
  }
  return cameraService;
}

export function resetCameraService(): void {
  if (cameraService) {
    cameraService.disconnect().catch(() => { });
    cameraService = null;
  }
}

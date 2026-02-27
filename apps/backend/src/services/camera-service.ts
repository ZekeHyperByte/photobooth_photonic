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

// Helper function for timestamped logging
function logWithTimestamp(
  level: "info" | "debug" | "error" | "warn",
  message: string,
  meta?: any,
) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [CameraService]`;
  if (meta) {
    logger[level](`${prefix} ${message}`, meta);
  } else {
    logger[level](`${prefix} ${message}`);
  }
}

export class CameraService {
  private provider: CameraProvider | null = null;
  private isInitialized = false;
  private _isStreaming = false;
  private initializationPromise: Promise<void> | null = null;
  private framePullTimeout: ReturnType<typeof setTimeout> | null = null;
  private pullFrameAbortController: AbortController | null = null;

  constructor(provider?: CameraProvider) {
    if (provider) {
      // Use provided provider (from CameraManager)
      this.provider = provider;
      logWithTimestamp(
        "info",
        "Camera service using provider from CameraManager",
        {
          platform: process.platform,
        },
      );
    } else {
      // Provider will be set lazily or from CameraManager later
      logWithTimestamp(
        "info",
        "Camera service initialized without provider (lazy loading)",
        {
          platform: process.platform,
        },
      );
    }
  }

  async initialize(): Promise<void> {
    // If already initializing, wait for that
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this.doInitialize();
    return this.initializationPromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      // Try to get provider from CameraManager if not set
      if (!this.provider) {
        const cameraManager = getCameraManager();
        this.provider = cameraManager.getActiveProvider();
      }

      if (this.provider?.isConnected()) {
        this.isInitialized = true;
        logWithTimestamp("info", "Camera service initialized successfully");
      } else {
        // Provider not ready yet - that's OK, will retry on operations
        logWithTimestamp(
          "warn",
          "Camera provider not connected, will retry on first operation",
        );
        this.isInitialized = false;
      }
    } catch (error) {
      logWithTimestamp(
        "warn",
        "Camera service initialization deferred - provider not ready",
        {
          error: error instanceof Error ? error.message : String(error),
        },
      );
      this.isInitialized = false;
    }
  }

  /**
   * Try to get provider, with automatic retry from CameraManager
   */
  private async getProvider(): Promise<CameraProvider> {
    // If we have a provider and it's connected, use it
    if (this.provider?.isConnected()) {
      return this.provider;
    }

    // Try to get from CameraManager
    const cameraManager = getCameraManager();
    const provider = cameraManager.getActiveProvider();

    if (provider) {
      this.provider = provider;
      this.isInitialized = true;
      logWithTimestamp("debug", "Got provider from CameraManager");
      return provider;
    }

    throw new Error("Camera not available - initializing or recovering");
  }

  isConnected(): boolean {
    return this.isInitialized && (this.provider?.isConnected() ?? false);
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
    logWithTimestamp("info", "Starting preview stream...");

    const provider = await this.getProvider();

    if (!provider.isConnected()) {
      throw new Error("Camera not connected");
    }

    // CRITICAL FIX: Force stop any existing stream first
    if (this._isStreaming) {
      logWithTimestamp(
        "warn",
        "Preview stream already active, forcing cleanup before new stream",
      );
      await this.forceStopPreview();
      await new Promise((resolve) => setTimeout(resolve, 500)); // Wait for cleanup
      logWithTimestamp("debug", "Cleanup wait complete");
    }

    // Validate provider state - stop live view if provider thinks it's active
    if (provider.isLiveViewActive && provider.isLiveViewActive()) {
      logWithTimestamp(
        "warn",
        "Provider reports live view active, stopping first",
      );
      try {
        await provider.stopLiveView();
        await new Promise((resolve) => setTimeout(resolve, 500));
        logWithTimestamp("debug", "Provider live view stopped");
      } catch (error) {
        logWithTimestamp("debug", "Error stopping existing live view", {
          error: (error as Error).message,
        });
      }
    }

    try {
      // Create abort controller for this stream
      this.pullFrameAbortController = new AbortController();
      const abortSignal = this.pullFrameAbortController.signal;

      // Start live view on the provider
      logWithTimestamp("debug", "Starting live view on provider...");
      await provider.startLiveView();
      this._isStreaming = true;
      logWithTimestamp(
        "info",
        "Preview stream started via CameraManager provider",
      );

      // Create a readable stream that pulls frames from the provider
      const stream = new Readable({
        objectMode: true,
        read() {
          // This is a no-op - we'll push data manually
        },
      });

      // Frame pulling loop
      const pullFrame = async () => {
        // Check if aborted
        if (abortSignal.aborted || !this._isStreaming || !stream.readable) {
          logWithTimestamp("debug", "Frame pull aborted or stream stopped");
          return;
        }

        try {
          const frame = await provider.getLiveViewFrame();
          if (frame && frame.length > 0) {
            // Create MJPEG frame boundary
            const boundary = Buffer.from("--frame\r\n");
            const contentType = Buffer.from("Content-Type: image/jpeg\r\n\r\n");

            // Push the complete frame
            stream.push(
              Buffer.concat([
                boundary,
                contentType,
                frame,
                Buffer.from("\r\n"),
              ]),
            );
          }

          // Schedule next frame only if still streaming
          if (!abortSignal.aborted && this._isStreaming && stream.readable) {
            this.framePullTimeout = setTimeout(pullFrame, 33); // ~30fps
          }
        } catch (error: any) {
          // CRITICAL FIX: Don't log "Live view not active" as error - it's expected when stopping
          if (error.message?.includes("Live view not active")) {
            logWithTimestamp(
              "debug",
              "Live view stopped, ending frame pull loop",
            );
            return; // Don't reschedule
          }

          logWithTimestamp("error", "Error pulling frame", {
            error: error.message,
          });

          // Only retry if still streaming
          if (!abortSignal.aborted && this._isStreaming && stream.readable) {
            this.framePullTimeout = setTimeout(pullFrame, 100);
          }
        }
      };

      // Start pulling frames
      pullFrame();

      return stream;
    } catch (error) {
      logWithTimestamp("error", "Failed to start preview stream", {
        error: (error as Error).message,
      });
      this._isStreaming = false;
      throw error;
    }
  }

  /**
   * Stop preview stream
   */
  async stopPreviewStream(): Promise<void> {
    if (!this._isStreaming && !this.framePullTimeout) {
      return;
    }

    logWithTimestamp("info", "Stopping preview stream...");

    // CRITICAL FIX: Clear any pending timeouts first
    if (this.framePullTimeout) {
      clearTimeout(this.framePullTimeout);
      this.framePullTimeout = null;
      logWithTimestamp("debug", "Cleared pending frame pull timeout");
    }

    // Abort any ongoing frame pulls
    if (this.pullFrameAbortController) {
      this.pullFrameAbortController.abort();
      this.pullFrameAbortController = null;
      logWithTimestamp("debug", "Aborted frame pull controller");
    }

    this._isStreaming = false;

    try {
      const provider = await this.getProvider();
      await provider.stopLiveView();
      logWithTimestamp("info", "Preview stream stopped successfully");
    } catch (error) {
      logWithTimestamp("error", "Error stopping preview stream", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Force stop preview - used when state is corrupted
   */
  async forceStopPreview(): Promise<void> {
    logWithTimestamp("info", "Force stopping preview stream...");

    // Clear any pending timeouts
    if (this.framePullTimeout) {
      clearTimeout(this.framePullTimeout);
      this.framePullTimeout = null;
    }

    // Abort any ongoing frame pulls
    if (this.pullFrameAbortController) {
      this.pullFrameAbortController.abort();
      this.pullFrameAbortController = null;
    }

    this._isStreaming = false;

    try {
      const provider = await this.getProvider();
      // Try to stop multiple times to ensure cleanup
      await provider.stopLiveView().catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 300));
      await provider.stopLiveView().catch(() => {});
    } catch (error) {
      logWithTimestamp("debug", "Error during force stop (expected)", {
        error: (error as Error).message,
      });
    }

    logWithTimestamp("info", "Force stop complete");
  }

  /**
   * Capture photo using provider
   */
  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<{ imagePath: string; metadata: CameraMetadata }> {
    logWithTimestamp("info", `Capture request received`, {
      sessionId,
      sequenceNumber,
    });

    const provider = await this.getProvider();

    if (!provider.isConnected()) {
      throw new Error("Camera not connected");
    }

    try {
      // Use CameraManager for capture to track health
      const cameraManager = getCameraManager();
      const result = await cameraManager.capturePhoto(
        sessionId,
        sequenceNumber,
      );

      logWithTimestamp("info", `Photo captured successfully`, {
        imagePath: result.imagePath,
        sessionId,
        sequenceNumber,
      });

      return {
        imagePath: result.imagePath,
        metadata: result.metadata || {},
      };
    } catch (error) {
      logWithTimestamp("error", "Capture failed", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  async cancelCapture(): Promise<void> {
    try {
      const provider = await this.getProvider();
      if (provider.cancelCapture) {
        await provider.cancelCapture();
        logWithTimestamp("info", "Capture cancelled");
      } else {
        logWithTimestamp("debug", "Provider does not support cancelCapture");
      }
    } catch (error) {
      logWithTimestamp("error", "Error cancelling capture", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get camera status
   */
  async getStatus(): Promise<CameraStatusResponse> {
    try {
      const cameraManager = getCameraManager();
      const status = await cameraManager.getStatus();

      return {
        connected: status.connected,
        model: status.model,
        battery: status.battery,
        storageAvailable: status.storageAvailable ?? false,
        settings: status.settings || {},
      };
    } catch (error) {
      logWithTimestamp("debug", "Could not get camera status", {
        error: (error as Error).message,
      });
      return {
        connected: false,
        model: "Not Available",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }
  }

  /**
   * Get extended status with health info
   */
  async getExtendedStatus(): Promise<ExtendedCameraStatusResponse> {
    try {
      const cameraManager = getCameraManager();
      return await cameraManager.getStatus();
    } catch (error) {
      logWithTimestamp("debug", "Could not get extended status", {
        error: (error as Error).message,
      });
      return {
        connected: false,
        model: "Not Available",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }
  }

  /**
   * Extend camera shutdown timer
   */
  async extendShutDownTimer(): Promise<void> {
    try {
      const provider = await this.getProvider();
      await provider.extendShutDownTimer();
    } catch (error) {
      logWithTimestamp("debug", "Could not extend shutdown timer", {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Trigger auto-focus
   */
  async triggerFocus(): Promise<void> {
    try {
      const provider = await this.getProvider();
      await provider.triggerFocus();
    } catch (error) {
      logWithTimestamp("error", "Focus trigger failed", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Configure camera settings
   * Note: This is a placeholder - actual configuration depends on provider capabilities
   */
  async configure(settings: CameraSettings): Promise<CameraSettings> {
    logWithTimestamp("info", "Configuring camera settings", settings);

    try {
      const provider = await this.getProvider();

      // Apply settings if the provider supports them
      // This is a simplified implementation
      const results: CameraSettings = {};

      if (settings.iso) {
        try {
          // ISO property ID for Canon EDSDK: 0x00000101
          await provider.setProperty(0x00000101, settings.iso);
          results.iso = settings.iso;
        } catch (error) {
          logWithTimestamp("warn", "Could not set ISO", {
            error: (error as Error).message,
          });
        }
      }

      if (settings.aperture) {
        try {
          // Aperture property ID: 0x00000102
          await provider.setProperty(0x00000102, settings.aperture);
          results.aperture = settings.aperture;
        } catch (error) {
          logWithTimestamp("warn", "Could not set aperture", {
            error: (error as Error).message,
          });
        }
      }

      if (settings.shutterSpeed) {
        try {
          // Shutter speed property ID: 0x00000103
          await provider.setProperty(0x00000103, settings.shutterSpeed);
          results.shutterSpeed = settings.shutterSpeed;
        } catch (error) {
          logWithTimestamp("warn", "Could not set shutter speed", {
            error: (error as Error).message,
          });
        }
      }

      if (settings.whiteBalance) {
        try {
          // White balance property ID: 0x00000104
          await provider.setProperty(0x00000104, settings.whiteBalance);
          results.whiteBalance = settings.whiteBalance;
        } catch (error) {
          logWithTimestamp("warn", "Could not set white balance", {
            error: (error as Error).message,
          });
        }
      }

      logWithTimestamp("info", "Camera configuration applied", results);
      return results;
    } catch (error) {
      logWithTimestamp("error", "Configuration failed", {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Disconnect camera and cleanup
   */
  async disconnect(): Promise<void> {
    logWithTimestamp("info", "Camera service disconnecting...");

    try {
      // Stop streaming if active
      if (this._isStreaming) {
        await this.stopPreviewStream();
      }

      // Disconnect provider if available
      if (this.provider) {
        await this.provider.disconnect();
        logWithTimestamp("info", "Camera provider disconnected");
      }

      this.isInitialized = false;
      this.provider = null;
      this.initializationPromise = null;

      logWithTimestamp("info", "Camera service disconnected successfully");
    } catch (error) {
      logWithTimestamp("error", "Error during camera service disconnect", {
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// Singleton instance
let cameraServiceInstance: CameraService | null = null;

export function getCameraService(provider?: CameraProvider): CameraService {
  if (!cameraServiceInstance) {
    cameraServiceInstance = new CameraService(provider);
  }
  return cameraServiceInstance;
}

export function resetCameraService(): void {
  cameraServiceInstance = null;
}

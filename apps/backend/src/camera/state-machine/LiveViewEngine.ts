/**
 * Live View Engine
 *
 * Dedicated thread for capturing live view frames from the camera.
 * Maintains a circular buffer of recent frames and provides thread-safe access.
 */

import * as C from "../bindings/constants";
import {
  LiveViewFrame,
  LiveViewStats,
  LiveViewConfig,
  DEFAULT_LIVEVIEW_CONFIG,
} from "./types";
import { cameraLogger } from "../logger";
import { LiveViewError } from "../errors";
import { EdsdkBindings } from "../bindings/edsdk-bindings";

export type LiveViewState = "STOPPED" | "STARTING" | "RUNNING" | "STOPPING" | "ERROR";

export class LiveViewEngine {
  private state: LiveViewState = "STOPPED";
  private frameBuffer: LiveViewFrame[] = [];
  private currentSequence: number = 0;
  private captureThread: Promise<void> | null = null;
  private shouldStop: boolean = false;
  private lastError: Error | null = null;
  private stats: LiveViewStats;
  private config: LiveViewConfig;

  // Frame access lock
  private frameLock: boolean = false;

  constructor(
    private sdk: EdsdkBindings,
    private cameraRef: any,
    config: Partial<LiveViewConfig> = {}
  ) {
    this.config = { ...DEFAULT_LIVEVIEW_CONFIG, ...config };
    this.stats = {
      fps: 0,
      targetFps: this.config.targetFps,
      totalFrames: 0,
      droppedFrames: 0,
      lastFrameTime: 0,
      averageFrameTime: 0,
      bufferSize: 0,
    };
  }

  /**
   * Start the live view engine
   *
   * @returns Promise that resolves when engine is running
   */
  async start(): Promise<void> {
    if (this.state === "RUNNING" || this.state === "STARTING") {
      cameraLogger.debug("LiveViewEngine: Already running or starting");
      return;
    }

    if (this.state === "ERROR") {
      cameraLogger.info("LiveViewEngine: Resetting from error state");
      this.reset();
    }

    cameraLogger.info("LiveViewEngine: Starting");
    this.state = "STARTING";
    this.shouldStop = false;
    this.lastError = null;

    try {
      // Start the capture thread
      this.captureThread = this.captureLoop();

      // Wait for the engine to actually start
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds (100ms * 50)

      while (this.state === "STARTING" && attempts < maxAttempts) {
        await this.sleep(100);
        attempts++;
      }

      if (this.state !== "RUNNING") {
        throw new LiveViewError("Live view engine failed to start", {
          operation: "start",
        });
      }

      cameraLogger.info("LiveViewEngine: Started successfully");
    } catch (error) {
      this.state = "ERROR";
      this.lastError =
        error instanceof Error ? error : new Error(String(error));
      throw error;
    }
  }

  /**
   * Stop the live view engine
   *
   * @returns Promise that resolves when engine is stopped
   */
  async stop(): Promise<void> {
    if (this.state === "STOPPED" || this.state === "STOPPING") {
      cameraLogger.debug("LiveViewEngine: Already stopped or stopping");
      return;
    }

    cameraLogger.info("LiveViewEngine: Stopping");
    this.state = "STOPPING";
    this.shouldStop = true;

    // Wait for capture thread to finish
    if (this.captureThread) {
      try {
        await Promise.race([
          this.captureThread,
          new Promise((_, reject) => setTimeout(() => reject(new Error("Stop timeout")), 5000)),
        ]);
      } catch (error) {
        cameraLogger.warn("LiveViewEngine: Error waiting for capture thread", { error });
      }
      this.captureThread = null;
    }

    // Clear frame buffer
    this.frameBuffer = [];
    this.state = "STOPPED";

    cameraLogger.info("LiveViewEngine: Stopped");
  }

  /**
   * Get the latest frame from the buffer
   *
   * @returns The latest frame, or null if no frame available
   */
  async getFrame(): Promise<LiveViewFrame | null> {
    // Wait for frame lock
    while (this.frameLock) {
      await this.sleep(1);
    }

    this.frameLock = true;
    try {
      if (this.frameBuffer.length === 0) {
        return null;
      }

      // Return the most recent frame
      return this.frameBuffer[this.frameBuffer.length - 1];
    } finally {
      this.frameLock = false;
    }
  }

  /**
   * Get current state
   */
  getState(): LiveViewState {
    return this.state;
  }

  /**
   * Get current statistics
   */
  getStats(): LiveViewStats {
    return { ...this.stats, bufferSize: this.frameBuffer.length };
  }

  /**
   * Get last error
   */
  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Check if engine is running
   */
  isRunning(): boolean {
    return this.state === "RUNNING";
  }

  /**
   * Main capture loop running in background
   */
  private async captureLoop(): Promise<void> {
    cameraLogger.debug("LiveViewEngine: Capture loop started");
    this.state = "RUNNING";

    const targetFrameTime = 1000 / this.config.targetFps;
    let consecutiveErrors = 0;
    const maxConsecutiveErrors = 10;

    while (!this.shouldStop) {
      const frameStartTime = Date.now();

      try {
        // Capture a frame
        const frame = await this.captureFrame();

        if (frame) {
          // Add to buffer
          await this.addFrameToBuffer(frame);

          // Update stats
          this.updateStats(frame.timestamp);
          consecutiveErrors = 0;
        }
      } catch (error) {
        consecutiveErrors++;
        cameraLogger.warn(
          `LiveViewEngine: Frame capture error (${consecutiveErrors}/${maxConsecutiveErrors})`,
          { error }
        );

        if (consecutiveErrors >= maxConsecutiveErrors) {
          cameraLogger.error(
            "LiveViewEngine: Too many consecutive errors, stopping"
          );
          this.lastError =
            error instanceof Error ? error : new Error(String(error));
          this.state = "ERROR";
          break;
        }

        // Brief pause before retry
        await this.sleep(100);
      }

      // Calculate sleep time to maintain target FPS
      const elapsed = Date.now() - frameStartTime;
      const sleepTime = Math.max(0, targetFrameTime - elapsed);

      if (sleepTime > 0) {
        await this.sleep(sleepTime);
      }
    }

    cameraLogger.debug("LiveViewEngine: Capture loop ended");
  }

  /**
   * Capture a single frame from the camera
   */
  private async captureFrame(): Promise<LiveViewFrame | null> {
    let stream: any = null;
    let evfImage: any = null;

    try {
      // Create memory stream
      const streamOut = [null];
      const streamErr = this.sdk.EdsCreateMemoryStream(BigInt(0), streamOut);
      if (streamErr !== C.EDS_ERR_OK) {
        throw new LiveViewError(
          `Failed to create memory stream: ${C.edsErrorToString(streamErr)}`,
          { operation: "captureFrame" }
        );
      }
      stream = streamOut[0];

      // Create EVF image reference
      const evfOut = [null];
      const evfErr = this.sdk.EdsCreateEvfImageRef(stream, evfOut);
      if (evfErr !== C.EDS_ERR_OK) {
        throw new LiveViewError(
          `Failed to create EVF reference: ${C.edsErrorToString(evfErr)}`,
          { operation: "captureFrame" }
        );
      }
      evfImage = evfOut[0];

      // Download the frame
      const downloadErr = this.sdk.EdsDownloadEvfImage(this.cameraRef, evfImage);

      // Handle expected "not ready" errors
      if (downloadErr === 0x00000041 || downloadErr === C.EDS_ERR_OBJECT_NOTREADY) {
        // Stream not ready yet, return null (will retry next frame)
        return null;
      }

      // Handle stream errors
      if (
        downloadErr === C.EDS_ERR_STREAM_NOT_OPEN ||
        downloadErr === C.EDS_ERR_COMM_USB_BUS_ERR
      ) {
        // Transient error, return null
        return null;
      }

      if (downloadErr !== C.EDS_ERR_OK) {
        throw new LiveViewError(
          `Failed to download EVF: ${C.edsErrorToString(downloadErr)}`,
          { operation: "captureFrame" }
        );
      }

      // Get the image data
      const lengthOut = [BigInt(0)];
      this.sdk.EdsGetLength(stream, lengthOut);
      const length = Number(lengthOut[0]);

      if (length === 0) {
        return null;
      }

      // Get pointer to data
      const pointerOut = [null];
      this.sdk.EdsGetPointer(stream, pointerOut);

      // Decode the image data
      const koffi = require("koffi");
      const imageData = koffi.decode(pointerOut[0], "uint8", length);
      const buffer = Buffer.from(imageData);

      // Verify it's a valid JPEG
      if (buffer.length < 3 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
        cameraLogger.debug("LiveViewEngine: Invalid JPEG data received");
        return null;
      }

      this.currentSequence++;

      return {
        data: buffer,
        timestamp: Date.now(),
        sequence: this.currentSequence,
      };
    } finally {
      // Cleanup
      if (evfImage) {
        try {
          this.sdk.EdsRelease(evfImage);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
      if (stream) {
        try {
          this.sdk.EdsRelease(stream);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    }
  }

  /**
   * Add frame to circular buffer
   */
  private async addFrameToBuffer(frame: LiveViewFrame): Promise<void> {
    // Wait for frame lock
    while (this.frameLock) {
      await this.sleep(1);
    }

    this.frameLock = true;
    try {
      // Add to buffer
      this.frameBuffer.push(frame);

      // Remove old frames if buffer is full
      while (this.frameBuffer.length > this.config.bufferSize) {
        this.frameBuffer.shift();
        this.stats.droppedFrames++;
      }
    } finally {
      this.frameLock = false;
    }
  }

  /**
   * Update statistics
   */
  private updateStats(timestamp: number): void {
    this.stats.totalFrames++;

    if (this.stats.lastFrameTime > 0) {
      const frameTime = timestamp - this.stats.lastFrameTime;
      this.stats.averageFrameTime =
        this.stats.averageFrameTime * 0.9 + frameTime * 0.1;
      this.stats.fps = 1000 / this.stats.averageFrameTime;
    }

    this.stats.lastFrameTime = timestamp;
  }

  /**
   * Reset the engine to initial state
   */
  private reset(): void {
    this.state = "STOPPED";
    this.frameBuffer = [];
    this.currentSequence = 0;
    this.captureThread = null;
    this.shouldStop = false;
    this.lastError = null;
    this.stats = {
      fps: 0,
      targetFps: this.config.targetFps,
      totalFrames: 0,
      droppedFrames: 0,
      lastFrameTime: 0,
      averageFrameTime: 0,
      bufferSize: 0,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

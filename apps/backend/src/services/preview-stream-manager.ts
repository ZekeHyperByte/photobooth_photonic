/**
 * Preview Stream Manager
 *
 * Manages MJPEG preview streams from the camera to multiple HTTP clients.
 * Handles frame extraction, broadcasting, and lifecycle management.
 */

import { ServerResponse } from "http";
import { EventEmitter } from "events";
import { createLogger } from "@photonic/utils";
import { getCameraService } from "./camera-service";
import { nanoid } from "nanoid";

const logger = createLogger("preview-stream");

const BOUNDARY = "frame";
const FRAME_INTERVAL_MS = 200; // ~5fps

interface Client {
  id: string;
  res: ServerResponse;
}

// Helper function for timestamped logging
function logWithTimestamp(
  level: "info" | "debug" | "error" | "warn",
  message: string,
  meta?: any,
) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [PreviewManager]`;
  if (meta) {
    logger[level](`${prefix} ${message}`, meta);
  } else {
    logger[level](`${prefix} ${message}`);
  }
}

class PreviewStreamManager extends EventEmitter {
  private clients: Map<string, Client> = new Map();
  private loopRunning = false;
  private loopStoppedResolve: (() => void) | null = null;
  private loopStopped: Promise<void> | null = null;
  private previewStream: NodeJS.ReadableStream | null = null;
  private frameBuffer: Buffer = Buffer.alloc(0);
  private isCollectingFrame = false;
  private firstFrameSent = false;

  addClient(res: ServerResponse): string {
    const id = nanoid();
    this.clients.set(id, { id, res });
    logWithTimestamp(
      "info",
      `Client added: ${id} (total: ${this.clients.size})`,
    );

    if (!this.loopRunning) {
      logWithTimestamp("debug", "Starting preview loop...");
      this.startLoop();
    } else {
      logWithTimestamp("debug", "Loop already running, reusing existing loop");
    }

    return id;
  }

  removeClient(id: string): void {
    this.clients.delete(id);
    logWithTimestamp(
      "info",
      `Client removed: ${id} (total: ${this.clients.size})`,
    );

    if (this.clients.size === 0) {
      logWithTimestamp("debug", "No more clients, stopping loop");
      this.stopLoop();
    }
  }

  async stopAll(): Promise<void> {
    logWithTimestamp(
      "info",
      `Stopping all ${this.clients.size} clients and cleaning up...`,
    );
    this.loopRunning = false;

    // CRITICAL FIX: Remove all listeners from preview stream to prevent memory leaks
    if (this.previewStream) {
      logWithTimestamp("debug", "Removing stream listeners");
      this.previewStream.removeAllListeners();
      this.previewStream = null;
    }

    // Clear frame buffer
    this.frameBuffer = Buffer.alloc(0);
    this.isCollectingFrame = false;
    logWithTimestamp("debug", "Frame buffer cleared");

    // Close all client connections
    for (const [id, client] of this.clients) {
      try {
        client.res.end();
      } catch {
        // client already disconnected
      }
    }
    this.clients.clear();
    logWithTimestamp("debug", "All client connections closed");

    // Wait for loop to fully stop
    if (this.loopStopped) {
      logWithTimestamp("debug", "Waiting for loop to stop...");
      await this.loopStopped;
      logWithTimestamp("debug", "Loop stopped");
    }

    logWithTimestamp(
      "info",
      "All preview clients stopped and state cleaned up",
    );
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /**
   * Restart preview stream if there are connected clients
   * Used after capture to resume preview
   */
  restartPreview(): void {
    if (this.clients.size > 0 && !this.loopRunning) {
      logWithTimestamp(
        "info",
        `Restarting preview stream (${this.clients.size} clients connected)`,
      );
      this.startLoop();
    }
  }

  private startLoop(): void {
    if (this.loopRunning) {
      logWithTimestamp("warn", "Loop already running, skipping start");
      return;
    }

    // CRITICAL FIX: Clean up any existing stream before starting new one
    if (this.previewStream) {
      logWithTimestamp(
        "warn",
        "Old preview stream exists, cleaning up before new loop",
      );
      this.previewStream.removeAllListeners();
      this.previewStream = null;
      this.frameBuffer = Buffer.alloc(0);
    }

    // Reset first frame flag for this session
    this.firstFrameSent = false;

    this.loopRunning = true;
    this.loopStopped = new Promise((resolve) => {
      this.loopStoppedResolve = resolve;
    });
    const cameraService = getCameraService();

    logWithTimestamp("info", "Preview loop started");

    const run = async () => {
      try {
        // Start CLI-based preview stream
        logWithTimestamp("info", "Starting CLI preview stream...");
        this.previewStream = await cameraService.startPreviewStream();
        logWithTimestamp("info", "CLI preview stream started successfully");

        let frameCount = 0;
        let errorCount = 0;
        let consecutiveErrors = 0;
        const MAX_CONSECUTIVE_ERRORS = 3;

        // Handle incoming data from preview stream
        this.previewStream.on("data", (chunk: Buffer) => {
          // Accumulate data and look for JPEG frames
          this.frameBuffer = Buffer.concat([this.frameBuffer, chunk]);

          // Process complete JPEG frames from the buffer
          this.processFrames((frame) => {
            if (!this.loopRunning) return;

            try {
              this.broadcastFrame(frame);
              frameCount++;
              consecutiveErrors = 0;

              if (frameCount === 1) {
                logWithTimestamp(
                  "info",
                  `First preview frame broadcast (${frame.length} bytes)`,
                );
                // Emit event to notify that first frame is sent (clears timeout)
                if (!this.firstFrameSent) {
                  this.firstFrameSent = true;
                  this.emit("firstFrame", { frameCount, frameLength: frame.length });
                }
              }
            } catch (err: any) {
              errorCount++;
              consecutiveErrors++;
              logWithTimestamp("error", `Broadcast error: ${err.message}`);

              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                logWithTimestamp(
                  "error",
                  `Too many consecutive errors (${consecutiveErrors}), stopping stream`,
                );
                this.loopRunning = false;
              }
            }
          });
        });

        this.previewStream.on("error", (err: Error) => {
          logWithTimestamp("error", `Preview stream error: ${err.message}`);
          errorCount++;
          consecutiveErrors++;

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            logWithTimestamp(
              "error",
              `Max consecutive errors reached, stopping loop`,
            );
            this.loopRunning = false;
          }
        });

        this.previewStream.on("end", () => {
          logWithTimestamp("info", "Preview stream ended");
          this.loopRunning = false;
        });

        // Keep loop running while clients are connected
        while (this.loopRunning && this.clients.size > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        logWithTimestamp(
          "info",
          `Preview loop stats: ${frameCount} frames sent, ${errorCount} errors`,
        );
      } catch (err: any) {
        logWithTimestamp("error", `Preview loop error: ${err.message}`);
      } finally {
        this.loopRunning = false;

        // CRITICAL FIX: Clean up stream listeners
        if (this.previewStream) {
          logWithTimestamp(
            "debug",
            "Cleaning up stream listeners in finally block",
          );
          this.previewStream.removeAllListeners();
          this.previewStream = null;
        }

        // Clear frame buffer
        this.frameBuffer = Buffer.alloc(0);
        this.isCollectingFrame = false;

        // Stop camera preview stream
        try {
          logWithTimestamp("debug", "Stopping camera preview stream...");
          await cameraService.stopPreviewStream();
          logWithTimestamp("debug", "Camera preview stream stopped");
        } catch (err: any) {
          logWithTimestamp(
            "error",
            `Error stopping preview stream: ${err.message}`,
          );
        }

        logWithTimestamp("info", "Preview loop ended");
        this.loopStoppedResolve?.();
        this.loopStopped = null;
        this.loopStoppedResolve = null;
      }
    };

    run();
  }

  /**
   * Process accumulated buffer to extract complete JPEG frames
   */
  private processFrames(onFrame: (frame: Buffer) => void): void {
    // MJPEG frames are just concatenated JPEG files
    // Look for JPEG markers: 0xFFD8 (start) and 0xFFD9 (end)

    while (this.frameBuffer.length > 100) {
      // Minimum JPEG size
      const startIdx = this.frameBuffer.indexOf(Buffer.from([0xff, 0xd8]));

      if (startIdx === -1) {
        // No start marker found, clear buffer
        this.frameBuffer = Buffer.alloc(0);
        return;
      }

      // Look for end marker after start
      const endIdx = this.frameBuffer.indexOf(
        Buffer.from([0xff, 0xd9]),
        startIdx + 2,
      );

      if (endIdx === -1) {
        // Incomplete frame, keep buffer and wait for more data
        // But remove any garbage before the start marker
        if (startIdx > 0) {
          this.frameBuffer = this.frameBuffer.slice(startIdx);
        }
        return;
      }

      // Extract complete frame (including end marker)
      const frame = this.frameBuffer.slice(startIdx, endIdx + 2);

      // Validate frame
      if (frame.length > 1000) {
        // Reasonable minimum size for a JPEG
        onFrame(frame);
      }

      // Remove processed frame from buffer
      this.frameBuffer = this.frameBuffer.slice(endIdx + 2);
    }
  }

  private stopLoop(): void {
    logWithTimestamp("debug", "Stop loop requested");
    this.loopRunning = false;
  }

  private broadcastFrame(frame: Buffer): void {
    const header =
      `--${BOUNDARY}\r\n` +
      `Content-Type: image/jpeg\r\n` +
      `Content-Length: ${frame.length}\r\n` +
      `\r\n`;

    const deadClients: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        client.res.write(header);
        client.res.write(frame);
        client.res.write("\r\n");
      } catch {
        deadClients.push(id);
      }
    }

    for (const id of deadClients) {
      this.clients.delete(id);
      logWithTimestamp("info", `Dead preview client removed: ${id}`);
    }

    if (this.clients.size === 0) {
      logWithTimestamp("debug", "No clients remaining, stopping loop");
      this.stopLoop();
    }
  }
}

let instance: PreviewStreamManager | null = null;

export function getPreviewStreamManager(): PreviewStreamManager {
  if (!instance) {
    instance = new PreviewStreamManager();
  }
  return instance;
}

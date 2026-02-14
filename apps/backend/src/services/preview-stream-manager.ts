import { ServerResponse } from "http";
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

class PreviewStreamManager {
  private clients: Map<string, Client> = new Map();
  private loopRunning = false;
  private loopStoppedResolve: (() => void) | null = null;
  private loopStopped: Promise<void> | null = null;
  private previewStream: NodeJS.ReadableStream | null = null;
  private frameBuffer: Buffer = Buffer.alloc(0);
  private isCollectingFrame = false;

  addClient(res: ServerResponse): string {
    const id = nanoid();
    this.clients.set(id, { id, res });
    logger.info(`Preview client added: ${id} (total: ${this.clients.size})`);

    if (!this.loopRunning) {
      this.startLoop();
    }

    return id;
  }

  removeClient(id: string): void {
    this.clients.delete(id);
    logger.info(`Preview client removed: ${id} (total: ${this.clients.size})`);

    if (this.clients.size === 0) {
      this.stopLoop();
    }
  }

  async stopAll(): Promise<void> {
    this.loopRunning = false;
    for (const [id, client] of this.clients) {
      try {
        client.res.end();
      } catch {
        // client already disconnected
      }
    }
    this.clients.clear();
    if (this.loopStopped) {
      await this.loopStopped;
    }
    logger.info("All preview clients stopped");
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
      logger.info(
        `Restarting preview stream (${this.clients.size} clients connected)`,
      );
      this.startLoop();
    }
  }

  private startLoop(): void {
    if (this.loopRunning) return;

    this.loopRunning = true;
    this.loopStopped = new Promise((resolve) => {
      this.loopStoppedResolve = resolve;
    });
    const cameraService = getCameraService();

    logger.info("Preview loop started");

    const run = async () => {
      try {
        // Start CLI-based preview stream
        logger.info("Starting CLI preview stream...");
        this.previewStream = await cameraService.startPreviewStream();

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
                logger.info(
                  `First preview frame broadcast (${frame.length} bytes)`,
                );
              }
            } catch (err: any) {
              errorCount++;
              consecutiveErrors++;
              logger.error(`Broadcast error: ${err.message}`);

              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                logger.error(`Too many consecutive errors, stopping stream`);
                this.loopRunning = false;
              }
            }
          });
        });

        this.previewStream.on("error", (err: Error) => {
          logger.error("Preview stream error:", err.message);
          errorCount++;
          consecutiveErrors++;

          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            this.loopRunning = false;
          }
        });

        this.previewStream.on("end", () => {
          logger.info("Preview stream ended");
          this.loopRunning = false;
        });

        // Keep loop running while clients are connected
        while (this.loopRunning && this.clients.size > 0) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        logger.info(
          `Preview loop stats: ${frameCount} frames sent, ${errorCount} errors`,
        );
      } catch (err: any) {
        logger.error("Preview loop error:", err.message);
      } finally {
        this.loopRunning = false;

        // Stop camera preview stream
        try {
          await cameraService.stopPreviewStream();
        } catch (err: any) {
          logger.error("Error stopping preview stream:", err.message);
        }

        logger.info("Preview loop ended");
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
      logger.info(`Dead preview client removed: ${id}`);
    }

    if (this.clients.size === 0) {
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

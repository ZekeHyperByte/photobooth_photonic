/**
 * Camera Event Pump
 *
 * Windows message pump for EDSDK events using setImmediate drain loop.
 * Replaces the 50ms polling interval with ~16ms (60fps) event processing.
 */

import os from "os";
import { cameraLogger } from "./logger";
import type { EdsdkBindings } from "./bindings/edsdk-bindings";

export class CameraEventPump {
  private isRunning = false;
  private pumpHandle:
    | ReturnType<typeof setImmediate>
    | ReturnType<typeof setTimeout>
    | null = null;
  private sdk: EdsdkBindings | null = null;
  private targetIntervalMs: number;
  private lastPumpTime = 0;
  private consecutiveErrors = 0;
  private readonly maxConsecutiveErrors = 10;

  constructor(targetFps = 60) {
    this.targetIntervalMs = 1000 / targetFps;
  }

  /**
   * Start the event pump
   * No-op on non-Windows platforms
   */
  start(sdk: EdsdkBindings): void {
    // No-op on non-Windows platforms
    if (os.platform() !== "win32") {
      cameraLogger.debug("EventPump: Skipping on non-Windows platform");
      return;
    }

    if (this.isRunning) {
      cameraLogger.debug("EventPump: Already running");
      return;
    }

    this.sdk = sdk;
    this.isRunning = true;
    this.consecutiveErrors = 0;
    this.lastPumpTime = Date.now();

    cameraLogger.info("EventPump: Starting Windows event pump", {
      targetIntervalMs: this.targetIntervalMs,
    });

    this.schedulePump();
  }

  /**
   * Stop the event pump cleanly
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pumpHandle) {
      // Handle both Immediate and Timeout types
      try {
        clearImmediate(this.pumpHandle as ReturnType<typeof setImmediate>);
      } catch {
        clearTimeout(this.pumpHandle as ReturnType<typeof setTimeout>);
      }
      this.pumpHandle = null;
    }

    this.sdk = null;

    cameraLogger.info("EventPump: Stopped");
  }

  /**
   * Check if pump is running
   */
  get running(): boolean {
    return this.isRunning;
  }

  private schedulePump(): void {
    if (!this.isRunning || !this.sdk) {
      return;
    }

    // Use setImmediate for next tick processing
    this.pumpHandle = setImmediate(() => {
      this.pump();
    });
  }

  private pump(): void {
    if (!this.isRunning || !this.sdk) {
      return;
    }

    const startTime = Date.now();

    try {
      // Process EDSDK events
      const result = this.sdk.EdsGetEvent();

      // Reset consecutive errors on success
      if (this.consecutiveErrors > 0) {
        this.consecutiveErrors = 0;
      }

      // Log any non-OK results at debug level
      if (result !== 0) {
        cameraLogger.debug(
          `EventPump: EdsGetEvent returned 0x${result.toString(16)}`,
        );
      }
    } catch (error) {
      this.consecutiveErrors++;

      // Log errors without crashing
      cameraLogger.error("EventPump: Error during pump", {
        error: error instanceof Error ? error.message : String(error),
        consecutiveErrors: this.consecutiveErrors,
      });

      // Stop pump if too many consecutive errors
      if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
        cameraLogger.error(
          "EventPump: Too many consecutive errors, stopping pump",
        );
        this.stop();
        return;
      }
    }

    // Calculate elapsed time and schedule next pump
    const elapsed = Date.now() - startTime;
    const nextDelay = Math.max(0, this.targetIntervalMs - elapsed);

    this.lastPumpTime = startTime;

    if (this.isRunning) {
      if (nextDelay <= 0) {
        // Immediately schedule next pump if we're behind
        this.pumpHandle = setImmediate(() => this.pump());
      } else {
        // Use setTimeout for longer delays to avoid blocking
        this.pumpHandle = setTimeout(() => {
          this.pumpHandle = setImmediate(() => this.pump());
        }, nextDelay);
      }
    }
  }
}

// Singleton instance
let globalEventPump: CameraEventPump | null = null;

export function getGlobalEventPump(): CameraEventPump {
  if (!globalEventPump) {
    globalEventPump = new CameraEventPump(60);
  }
  return globalEventPump;
}

export function stopGlobalEventPump(): void {
  if (globalEventPump) {
    globalEventPump.stop();
    globalEventPump = null;
  }
}

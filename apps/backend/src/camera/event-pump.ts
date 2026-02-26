/**
 * Camera Event Pump
 *
 * Windows message pump for EDSDK events using setImmediate drain loop.
 * Replaces the 50ms polling interval with ~16ms (60fps) event processing.
 * 
 * SAFETY FEATURES:
 * - Max consecutive pumps limit (prevents infinite loops)
 * - Forced event loop yielding every N pumps
 * - Error threshold with automatic stop
 * - CPU usage throttling
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

  // Safety counters to prevent infinite loops
  private consecutivePumps = 0;
  private readonly maxConsecutivePumps = 100; // Force yield after 100 consecutive pumps
  private totalPumps = 0;
  private pumpStartTime = 0;
  private readonly maxPumpsPerSecond = 1000; // Safety: max 1000 pumps/second

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
    this.consecutivePumps = 0;
    this.totalPumps = 0;
    this.pumpStartTime = Date.now();
    this.lastPumpTime = Date.now();

    cameraLogger.info("EventPump: Starting Windows event pump", {
      targetIntervalMs: this.targetIntervalMs,
      maxConsecutivePumps: this.maxConsecutivePumps,
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

    const runtime = Date.now() - this.pumpStartTime;
    cameraLogger.info("EventPump: Stopped", {
      totalPumps: this.totalPumps,
      runtimeMs: runtime,
      pumpsPerSecond: runtime > 0 ? (this.totalPumps / (runtime / 1000)).toFixed(2) : 0,
    });

    this.sdk = null;
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

    // Safety check: Force yield to event loop after max consecutive pumps
    if (this.consecutivePumps >= this.maxConsecutivePumps) {
      cameraLogger.debug("EventPump: Forcing yield to event loop after max consecutive pumps");
      this.consecutivePumps = 0;
      // Use setTimeout(0) to force yielding to the event loop
      this.pumpHandle = setTimeout(() => {
        this.pump();
      }, 0);
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

    this.totalPumps++;
    this.consecutivePumps++;
    const startTime = Date.now();

    // Safety check: Prevent runaway pumping (max pumps per second)
    const elapsedSinceStart = startTime - this.pumpStartTime;
    if (elapsedSinceStart > 1000) {
      const pumpsPerSecond = this.totalPumps / (elapsedSinceStart / 1000);
      if (pumpsPerSecond > this.maxPumpsPerSecond) {
        cameraLogger.error("EventPump: Runaway pump detected, stopping", {
          totalPumps: this.totalPumps,
          elapsedMs: elapsedSinceStart,
          pumpsPerSecond,
        });
        this.stop();
        return;
      }
    }

    try {
      // Process EDSDK events
      const result = this.sdk.EdsGetEvent();

      // Reset consecutive errors on success
      if (this.consecutiveErrors > 0) {
        this.consecutiveErrors = 0;
      }

      // Reset consecutive pumps counter on successful pump with no events
      // This prevents the counter from growing indefinitely
      if (result === 0) {
        this.consecutivePumps = 0;
      }

      // Log any non-OK results at debug level
      if (result !== 0) {
        cameraLogger.debug(
          `EventPump: EdsGetEvent returned 0x${result.toString(16)}`,
        );
      }
    } catch (error) {
      this.consecutiveErrors++;
      this.consecutivePumps = 0; // Reset on error

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
        this.schedulePump();
      } else {
        // Use setTimeout for longer delays to avoid blocking
        this.pumpHandle = setTimeout(() => {
          this.schedulePump();
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

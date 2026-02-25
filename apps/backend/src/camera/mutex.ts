/**
 * Capture Mutex
 *
 * Async mutex pattern for capture locking.
 * Supports both 'queue' and 'reject' modes.
 */

import { cameraLogger } from "./logger";
import { CamerasBusyError } from "./errors";

export type CaptureQueueMode = "queue" | "reject";

interface QueuedCapture {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  operation: () => Promise<any>;
  context: {
    sessionId?: string;
    sequenceNumber?: number;
    operation: string;
  };
}

export class CaptureMutex {
  private locked = false;
  private queue: QueuedCapture | null = null;
  private mode: CaptureQueueMode;

  constructor(mode: CaptureQueueMode = "reject") {
    this.mode = mode;
  }

  /**
   * Set the queue mode
   */
  setMode(mode: CaptureQueueMode): void {
    this.mode = mode;
    cameraLogger.info(`CaptureMutex: Mode set to ${mode}`);
  }

  /**
   * Get current lock status
   */
  isLocked(): boolean {
    return this.locked;
  }

  /**
   * Acquire the lock and execute operation
   */
  async acquire<T>(
    operation: () => Promise<T>,
    context: {
      sessionId?: string;
      sequenceNumber?: number;
      operation: string;
    },
  ): Promise<T> {
    if (!this.locked) {
      // Acquire lock immediately
      this.locked = true;
      cameraLogger.debug("CaptureMutex: Lock acquired", context);

      try {
        const result = await operation();
        return result;
      } finally {
        this.locked = false;
        cameraLogger.debug("CaptureMutex: Lock released", context);

        // Process queued capture if any
        this.processQueue();
      }
    }

    // Lock is held by another operation
    if (this.mode === "reject") {
      cameraLogger.warn(
        "CaptureMutex: Rejecting capture - camera busy",
        context,
      );
      throw new CamerasBusyError({
        operation: context.operation,
        sessionId: context.sessionId,
        sequenceNumber: context.sequenceNumber,
      });
    }

    // Queue mode: wait for lock
    if (this.queue) {
      cameraLogger.warn(
        "CaptureMutex: Queue full - rejecting capture",
        context,
      );
      throw new CamerasBusyError({
        operation: context.operation,
        sessionId: context.sessionId,
        sequenceNumber: context.sequenceNumber,
      });
    }

    cameraLogger.info("CaptureMutex: Queuing capture", context);

    return new Promise<T>((resolve, reject) => {
      this.queue = {
        resolve,
        reject,
        operation,
        context,
      };
    });
  }

  /**
   * Force release the lock (for error recovery)
   */
  forceRelease(): void {
    if (this.locked) {
      cameraLogger.warn("CaptureMutex: Force releasing lock");
      this.locked = false;

      // Reject any queued capture
      if (this.queue) {
        this.queue.reject(
          new CamerasBusyError({
            operation: this.queue.context.operation,
            sessionId: this.queue.context.sessionId,
            sequenceNumber: this.queue.context.sequenceNumber,
          }),
        );
        this.queue = null;
      }
    }
  }

  private processQueue(): void {
    if (!this.queue || this.locked) {
      return;
    }

    const queued = this.queue;
    this.queue = null;

    cameraLogger.info(
      "CaptureMutex: Processing queued capture",
      queued.context,
    );

    // Process queued capture asynchronously
    this.acquire(queued.operation, queued.context)
      .then(queued.resolve)
      .catch(queued.reject);
  }
}

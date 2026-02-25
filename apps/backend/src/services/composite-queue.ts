/**
 * Composite Queue
 *
 * Manages composite jobs in a worker thread.
 * Provides non-blocking image processing.
 */

import { Worker } from "worker_threads";
import path from "path";
import { nanoid } from "nanoid";
import { logger } from "@photonic/utils";

interface CompositeJob {
  id: string;
  type: "composite" | "template" | "collage";
  data: any;
  resolve: (result: any) => void;
  reject: (error: Error) => void;
}

interface WorkerMessage {
  id: string;
  success: boolean;
  outputPath?: string;
  error?: string;
  type?: string;
}

export class CompositeQueue {
  private worker: Worker | null = null;
  private queue: CompositeJob[] = [];
  private activeJob: CompositeJob | null = null;
  private workerReady = false;
  private workerPath: string;

  constructor() {
    this.workerPath = path.join(__dirname, "composite-worker.js");
    this.initWorker();
  }

  /**
   * Initialize the worker thread
   */
  private initWorker(): void {
    try {
      this.worker = new Worker(this.workerPath);

      this.worker.on("message", (message: WorkerMessage) => {
        if (message.type === "ready") {
          this.workerReady = true;
          logger.info("CompositeQueue: Worker ready");
          this.processQueue();
          return;
        }

        this.handleWorkerMessage(message);
      });

      this.worker.on("error", (error) => {
        logger.error("CompositeQueue: Worker error", { error });
        this.handleWorkerError(error);
      });

      this.worker.on("exit", (code) => {
        if (code !== 0) {
          logger.error(`CompositeQueue: Worker stopped with exit code ${code}`);
          // Restart worker
          this.workerReady = false;
          this.initWorker();
        }
      });

      logger.info("CompositeQueue: Worker initialized");
    } catch (error) {
      logger.error("CompositeQueue: Failed to initialize worker", { error });
    }
  }

  /**
   * Enqueue a composite job
   */
  async enqueue(jobData: {
    type: "composite" | "template" | "collage";
    data: any;
  }): Promise<any> {
    return new Promise((resolve, reject) => {
      const job: CompositeJob = {
        id: nanoid(),
        type: jobData.type,
        data: jobData.data,
        resolve,
        reject,
      };

      this.queue.push(job);
      logger.debug(
        `CompositeQueue: Job ${job.id} enqueued (queue depth: ${this.queue.length})`,
      );

      // Process if worker is ready and no active job
      if (this.workerReady && !this.activeJob) {
        this.processQueue();
      }
    });
  }

  /**
   * Get current queue depth
   */
  getQueueDepth(): number {
    return this.queue.length;
  }

  /**
   * Get worker status
   */
  getWorkerStatus(): "idle" | "busy" | "error" {
    if (!this.worker) {
      return "error";
    }
    if (this.activeJob) {
      return "busy";
    }
    return "idle";
  }

  /**
   * Terminate the worker
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      // Reject all pending jobs
      for (const job of this.queue) {
        job.reject(new Error("Worker terminated"));
      }
      this.queue = [];

      // Terminate worker
      await this.worker.terminate();
      this.worker = null;
      this.workerReady = false;

      logger.info("CompositeQueue: Worker terminated");
    }
  }

  private processQueue(): void {
    if (
      !this.worker ||
      !this.workerReady ||
      this.activeJob ||
      this.queue.length === 0
    ) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeJob = job;
    logger.debug(`CompositeQueue: Processing job ${job.id}`);

    this.worker.postMessage({
      id: job.id,
      type: job.type,
      data: job.data,
    });
  }

  private handleWorkerMessage(message: WorkerMessage): void {
    if (!this.activeJob) {
      logger.warn("CompositeQueue: Received message but no active job");
      return;
    }

    const job = this.activeJob;
    this.activeJob = null;

    if (message.success) {
      logger.debug(`CompositeQueue: Job ${job.id} completed successfully`);
      job.resolve({ outputPath: message.outputPath });
    } else {
      logger.error(`CompositeQueue: Job ${job.id} failed`, {
        error: message.error,
      });
      job.reject(new Error(message.error || "Unknown error"));
    }

    // Process next job
    this.processQueue();
  }

  private handleWorkerError(error: Error): void {
    if (this.activeJob) {
      const job = this.activeJob;
      this.activeJob = null;
      job.reject(error);
    }

    // Process next job to prevent queue stall
    this.processQueue();
  }
}

// Singleton instance
let compositeQueue: CompositeQueue | null = null;

export function getCompositeQueue(): CompositeQueue {
  if (!compositeQueue) {
    compositeQueue = new CompositeQueue();
  }
  return compositeQueue;
}

export function terminateCompositeQueue(): Promise<void> {
  if (compositeQueue) {
    return compositeQueue.terminate();
  }
  return Promise.resolve();
}

/**
 * Camera Manager - Python gphoto2 Only
 *
 * Simplified for Linux-only deployment with python-gphoto2 provider.
 */

import { EventEmitter } from "events";
import { cameraLogger } from "./logger";
import type { ExtendedCameraStatusResponse } from "./types";
import { PythonGPhoto2Provider } from "./python-gphoto2-provider";
import { CameraNotInitializedError } from "./errors";
import { performCameraReset, waitForCamera } from "./usb-reset";
import { env } from "../config/env";

export interface CameraManagerHealth {
  status: "healthy" | "degraded" | "failed" | "warming_up";
  consecutiveFailures: number;
  totalCaptures: number;
  successfulCaptures: number;
  failedCaptures: number;
  lastCaptureAt: string | null;
  lastError: string | null;
  lastResetAt: string | null;
  captureSuccessRate: number;
  isRecovering: boolean;
}

export class CameraManager extends EventEmitter {
  private provider: PythonGPhoto2Provider | null = null;
  private initialized = false;
  private initializing = false;

  private health: CameraManagerHealth = {
    status: "warming_up",
    consecutiveFailures: 0,
    totalCaptures: 0,
    successfulCaptures: 0,
    failedCaptures: 0,
    lastCaptureAt: null,
    lastError: null,
    lastResetAt: null,
    captureSuccessRate: 100,
    isRecovering: false,
  };

  private recoveryAttempts = 0;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly maxRecoveryAttempts = 10;

  /**
   * Initialize the camera manager - NON-BLOCKING
   */
  async initialize(): Promise<void> {
    cameraLogger.info("CameraManager: Initializing (python-gphoto2 only)");

    if (this.initialized || this.initializing) {
      return;
    }

    this.initializing = true;

    this.performInitialization().catch((error) => {
      cameraLogger.error("CameraManager: Async initialization error", {
        error,
      });
    });

    this.initialized = true;
    cameraLogger.info("CameraManager: Initialization started (non-blocking)");

    this.startHealthMonitoring();
  }

  private async performInitialization(): Promise<void> {
    try {
      await this.connectCamera();
      cameraLogger.info("CameraManager: Initialization complete");
    } catch (error) {
      cameraLogger.error("CameraManager: Async initialization failed", {
        error,
      });
      this.scheduleRecovery();
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Connect to the camera
   */
  private async connectCamera(): Promise<void> {
    try {
      this.provider = new PythonGPhoto2Provider();
      await this.provider.initialize();

      if (this.provider.isConnected()) {
        this.updateHealthStatus("healthy");
        this.emit("camera:connected", {
          timestamp: new Date().toISOString(),
        });
        cameraLogger.info("CameraManager: Camera connected successfully");
      } else {
        throw new Error("Camera provider initialized but not connected");
      }
    } catch (error) {
      cameraLogger.error("CameraManager: Failed to connect camera", { error });
      throw error;
    }
  }

  /**
   * Schedule automatic recovery attempt
   */
  private scheduleRecovery(): void {
    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
    }

    if (this.recoveryAttempts >= this.maxRecoveryAttempts) {
      cameraLogger.error(
        `CameraManager: Max recovery attempts (${this.maxRecoveryAttempts}) reached`,
      );
      this.updateHealthStatus("failed", "Max recovery attempts exceeded");
      return;
    }

    const delay = Math.min(5000 * Math.pow(2, this.recoveryAttempts), 60000);
    this.recoveryAttempts++;

    cameraLogger.info(
      `CameraManager: Scheduling recovery attempt ${this.recoveryAttempts} in ${delay}ms`,
    );

    this.recoveryTimer = setTimeout(async () => {
      await this.attemptRecovery();
    }, delay);
  }

  /**
   * Attempt camera recovery with USB reset
   */
  private async attemptRecovery(): Promise<void> {
    if (this.health.isRecovering) {
      return;
    }

    this.health.isRecovering = true;
    this.updateHealthStatus("warming_up");

    this.emit("camera:recovery:started", {
      attempt: this.recoveryAttempts,
      timestamp: new Date().toISOString(),
    });

    cameraLogger.info(
      `CameraManager: Starting recovery attempt ${this.recoveryAttempts}`,
    );

    try {
      // Disconnect current camera if any
      if (this.provider) {
        try {
          await this.provider.disconnect();
        } catch (error) {
          cameraLogger.debug(
            "CameraManager: Error during disconnect in recovery",
            { error },
          );
        }
      }

      // Perform USB reset
      cameraLogger.info("CameraManager: Performing USB reset...");
      const resetResult = await performCameraReset();

      if (!resetResult.success) {
        cameraLogger.warn("CameraManager: USB reset had warnings", resetResult);
      }

      // Wait for camera
      const cameraAvailable = await waitForCamera(30000, 1000);

      if (!cameraAvailable) {
        throw new Error("Camera did not become available after USB reset");
      }

      // Reconnect
      await this.connectCamera();

      this.health.consecutiveFailures = 0;
      this.health.lastResetAt = new Date().toISOString();
      this.health.isRecovering = false;
      this.updateHealthStatus("healthy");
      this.recoveryAttempts = 0;

      this.emit("camera:recovery:success", {
        timestamp: new Date().toISOString(),
        attempts: this.recoveryAttempts,
      });

      cameraLogger.info("CameraManager: Recovery successful!");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      cameraLogger.error(
        `CameraManager: Recovery attempt ${this.recoveryAttempts} failed`,
        { error },
      );

      this.health.isRecovering = false;
      this.updateHealthStatus("failed", errorMessage);

      this.emit("camera:recovery:failed", {
        attempt: this.recoveryAttempts,
        error: errorMessage,
        timestamp: new Date().toISOString(),
      });

      this.scheduleRecovery();
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = setInterval(() => {
      this.checkHealth();
    }, 30000);

    cameraLogger.info(
      "CameraManager: Health monitoring started (30s interval)",
    );
  }

  /**
   * Check camera health and trigger recovery if needed
   */
  private async checkHealth(): Promise<void> {
    if (this.health.isRecovering) {
      return;
    }

    if (this.provider && !this.provider.isConnected()) {
      cameraLogger.warn(
        "CameraManager: Health check detected disconnected camera",
      );
      this.updateHealthStatus("failed", "Camera disconnected");
      this.scheduleRecovery();
    } else if (!this.provider && this.health.status !== "warming_up") {
      cameraLogger.warn("CameraManager: Health check - no camera provider");
      this.scheduleRecovery();
    }
  }

  /**
   * Update health status
   */
  private updateHealthStatus(
    status: CameraManagerHealth["status"],
    errorMessage?: string,
  ): void {
    const oldStatus = this.health.status;
    this.health.status = status;

    if (errorMessage) {
      this.health.lastError = errorMessage;
    }

    if (oldStatus !== status) {
      this.emit("camera:status_changed", {
        oldStatus,
        newStatus: status,
        timestamp: new Date().toISOString(),
      });
    }

    if (this.health.totalCaptures > 0) {
      this.health.captureSuccessRate = Math.round(
        (this.health.successfulCaptures / this.health.totalCaptures) * 100,
      );
    }
  }

  /**
   * Disconnect camera and cleanup
   */
  async disconnect(): Promise<void> {
    cameraLogger.info("CameraManager: Disconnecting camera");

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.recoveryTimer) {
      clearTimeout(this.recoveryTimer);
      this.recoveryTimer = null;
    }

    if (this.provider) {
      try {
        await this.provider.disconnect();
      } catch (error) {
        cameraLogger.error("CameraManager: Error disconnecting camera", {
          error,
        });
      }
      this.provider = null;
    }

    this.initialized = false;
    this.initializing = false;

    cameraLogger.info("CameraManager: Camera disconnected");
  }

  /**
   * Get the active camera provider
   */
  getProvider(): PythonGPhoto2Provider | null {
    return this.provider;
  }

  /**
   * Get current health status
   */
  getHealth(): CameraManagerHealth {
    return { ...this.health };
  }

  /**
   * Record capture success/failure for health tracking
   */
  recordCapture(success: boolean, error?: string): void {
    this.health.totalCaptures++;
    this.health.lastCaptureAt = new Date().toISOString();

    if (success) {
      this.health.successfulCaptures++;
      this.health.consecutiveFailures = 0;

      if (this.health.status === "failed") {
        this.updateHealthStatus("healthy");
      }
    } else {
      this.health.failedCaptures++;
      this.health.consecutiveFailures++;
      this.health.lastError = error || "Unknown error";

      if (this.health.consecutiveFailures >= 3) {
        cameraLogger.warn(
          `CameraManager: ${this.health.consecutiveFailures} consecutive failures, triggering recovery`,
        );
        this.scheduleRecovery();
      }
    }

    if (this.health.totalCaptures > 0) {
      this.health.captureSuccessRate = Math.round(
        (this.health.successfulCaptures / this.health.totalCaptures) * 100,
      );
    }
  }

  /**
   * Capture photo
   */
  async capturePhoto(sessionId: string, sequenceNumber: number): Promise<any> {
    try {
      if (!this.provider) {
        throw new CameraNotInitializedError("capturePhoto", sessionId);
      }

      const result = await this.provider.capturePhoto(
        sessionId,
        sequenceNumber,
      );
      this.recordCapture(true);
      return result;
    } catch (error) {
      this.recordCapture(
        false,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }
  }

  /**
   * Start live view
   */
  async startLiveView(): Promise<void> {
    if (!this.provider) {
      throw new CameraNotInitializedError("startLiveView");
    }
    return this.provider.startLiveView();
  }

  /**
   * Stop live view
   */
  async stopLiveView(): Promise<void> {
    if (!this.provider) {
      throw new CameraNotInitializedError("stopLiveView");
    }
    return this.provider.stopLiveView();
  }

  /**
   * Get live view frame
   */
  async getLiveViewFrame(): Promise<Buffer> {
    if (!this.provider) {
      throw new CameraNotInitializedError("getLiveViewFrame");
    }
    return this.provider.getLiveViewFrame();
  }

  /**
   * Get active camera provider (alias for getProvider)
   * @deprecated Use getProvider() instead
   */
  getActiveProvider(): PythonGPhoto2Provider | null {
    return this.provider;
  }

  /**
   * Get active camera ID
   * Since we only have one camera, returns a fixed ID
   */
  getActiveCameraId(): string | null {
    return this.provider?.isConnected() ? "python-gphoto2" : null;
  }

  /**
   * Get camera status
   */
  async getStatus(): Promise<ExtendedCameraStatusResponse> {
    if (!this.provider) {
      return {
        connected: false,
        model: "No camera available",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }

    const status = await this.provider.getStatus();

    return {
      ...status,
      providerMetadata: {
        ...status.providerMetadata,
        health: this.getHealth(),
      },
    };
  }

  /**
   * Subscribe to camera events
   */
  onCameraEvent(event: string, handler: (data: any) => void): void {
    this.on(event, handler);
  }

  /**
   * Unsubscribe from camera events
   */
  offCameraEvent(event: string, handler: (data: any) => void): void {
    this.off(event, handler);
  }
}

// Singleton instance
let cameraManagerInstance: CameraManager | null = null;

export function getCameraManager(): CameraManager {
  if (!cameraManagerInstance) {
    cameraManagerInstance = new CameraManager();
  }
  return cameraManagerInstance;
}

export function resetCameraManager(): void {
  cameraManagerInstance = null;
}

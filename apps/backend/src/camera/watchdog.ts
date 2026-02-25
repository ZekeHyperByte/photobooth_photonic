/**
 * Camera Reconnection Watchdog
 *
 * Monitors camera connection status and automatically reconnects on disconnect.
 * Implements exponential backoff for reconnection attempts.
 */

import { EventEmitter } from "events";
import { cameraLogger } from "./logger";
import type { CameraProvider } from "./types";

export interface WatchdogStatus {
  status: "healthy" | "reconnecting" | "failed";
  reconnectAttempts: number;
  lastReconnectAt: string | null;
  isConnected: boolean;
}

export interface CameraWatchdogOptions {
  pollIntervalMs?: number;
  maxReconnectDelayMs?: number;
  onReconnect?: () => Promise<void>;
}

export class CameraWatchdog extends EventEmitter {
  private provider: CameraProvider;
  private pollIntervalMs: number;
  private maxReconnectDelayMs: number;
  private onReconnectCallback?: () => Promise<void>;

  private isRunning = false;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempts = 0;
  private lastReconnectAt: Date | null = null;
  private wasConnected = false;
  private isReconnecting = false;

  // Exponential backoff delays: immediate, 3s, 6s, 12s, 24s, cap at 30s
  private readonly backoffDelays = [0, 3000, 6000, 12000, 24000, 30000];

  constructor(provider: CameraProvider, options: CameraWatchdogOptions = {}) {
    super();
    this.provider = provider;
    this.pollIntervalMs = options.pollIntervalMs || 3000;
    this.maxReconnectDelayMs = options.maxReconnectDelayMs || 30000;
    this.onReconnectCallback = options.onReconnect;
  }

  /**
   * Start the watchdog
   */
  start(): void {
    if (this.isRunning) {
      cameraLogger.debug("Watchdog: Already running");
      return;
    }

    this.isRunning = true;
    this.wasConnected = this.provider.isConnected();

    cameraLogger.info("Watchdog: Started monitoring", {
      pollIntervalMs: this.pollIntervalMs,
    });

    // Start polling
    this.pollTimer = setInterval(() => {
      this.checkConnection();
    }, this.pollIntervalMs);

    // Initial check
    this.checkConnection();
  }

  /**
   * Stop the watchdog cleanly
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    cameraLogger.info("Watchdog: Stopped");
  }

  /**
   * Get current watchdog status
   */
  getStatus(): WatchdogStatus {
    return {
      status: this.isReconnecting
        ? "reconnecting"
        : this.provider.isConnected()
          ? "healthy"
          : "failed",
      reconnectAttempts: this.reconnectAttempts,
      lastReconnectAt: this.lastReconnectAt?.toISOString() || null,
      isConnected: this.provider.isConnected(),
    };
  }

  /**
   * Reset reconnection state (call after manual reconnect)
   */
  reset(): void {
    this.reconnectAttempts = 0;
    this.isReconnecting = false;
    this.wasConnected = this.provider.isConnected();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    cameraLogger.info("Watchdog: Reset");
  }

  private checkConnection(): void {
    if (!this.isRunning) {
      return;
    }

    const isConnected = this.provider.isConnected();

    // Detect disconnect
    if (this.wasConnected && !isConnected) {
      cameraLogger.warn("Watchdog: Camera disconnected detected");
      this.emit("camera:disconnected", {
        timestamp: new Date().toISOString(),
      });
      this.startReconnectLoop();
    }

    // Detect reconnect (connection restored without our intervention)
    if (!this.wasConnected && isConnected && !this.isReconnecting) {
      cameraLogger.info("Watchdog: Camera connection restored");
      this.emit("camera:reconnected", {
        timestamp: new Date().toISOString(),
        auto: false,
      });
    }

    this.wasConnected = isConnected;
  }

  private startReconnectLoop(): void {
    if (this.isReconnecting) {
      return;
    }

    this.isReconnecting = true;
    this.reconnectAttempts = 0;

    cameraLogger.info("Watchdog: Starting reconnection loop");
    this.attemptReconnect();
  }

  private attemptReconnect(): void {
    if (!this.isRunning || !this.isReconnecting) {
      return;
    }

    // Check if already connected
    if (this.provider.isConnected()) {
      cameraLogger.info("Watchdog: Camera already connected");
      this.handleReconnectSuccess();
      return;
    }

    this.reconnectAttempts++;

    cameraLogger.info(
      `Watchdog: Reconnection attempt ${this.reconnectAttempts}`,
    );
    this.emit("reconnect_attempt", {
      attempt: this.reconnectAttempts,
      timestamp: new Date().toISOString(),
    });

    // Try to reconnect
    this.provider
      .initialize()
      .then(() => {
        cameraLogger.info("Watchdog: Reconnection successful");
        this.handleReconnectSuccess();
      })
      .catch((error) => {
        cameraLogger.error(
          `Watchdog: Reconnection attempt ${this.reconnectAttempts} failed`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );

        this.emit("reconnect_failed", {
          attempt: this.reconnectAttempts,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });

        // Schedule next attempt with exponential backoff
        this.scheduleNextReconnect();
      });
  }

  private handleReconnectSuccess(): void {
    this.isReconnecting = false;
    this.lastReconnectAt = new Date();
    this.wasConnected = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Call the onReconnect callback if provided
    if (this.onReconnectCallback) {
      this.onReconnectCallback().catch((error) => {
        cameraLogger.error("Watchdog: onReconnect callback failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      });
    }

    this.emit("camera:reconnected", {
      timestamp: this.lastReconnectAt.toISOString(),
      auto: true,
      attempts: this.reconnectAttempts,
    });
  }

  private scheduleNextReconnect(): void {
    if (!this.isRunning || !this.isReconnecting) {
      return;
    }

    // Get backoff delay
    const delayIndex = Math.min(
      this.reconnectAttempts,
      this.backoffDelays.length - 1,
    );
    const delay = this.backoffDelays[delayIndex];

    cameraLogger.info(`Watchdog: Scheduling next reconnect in ${delay}ms`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.attemptReconnect();
    }, delay);
  }
}

/**
 * Python GPhoto2 Provider
 *
 * Communicates with Python camera service via HTTP/WebSocket.
 * Provides fast live view and capture for Canon DSLR cameras.
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import path from "path";
import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "./types";
import { cameraLogger } from "./logger";
import { env } from "../config/env";

const PYTHON_SERVICE_URL = env.pythonCameraServiceUrl;
const PYTHON_SERVICE_WS_URL = env.pythonCameraServiceWsUrl;

// Base directory where Python service saves photos
const PYTHON_SERVICE_BASE_DIR = "/home/qiu/photonic-v0.1/services/camera";

export class PythonGPhoto2Provider
  extends EventEmitter
  implements CameraProvider
{
  private connected = false;
  private liveViewActive = false;
  private ws: WebSocket | null = null;
  private frameCallbacks: Set<(frame: Buffer) => void> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  // Frame buffer for pull model (getLiveViewFrame)
  private latestFrame: Buffer | null = null;
  private frameLock: boolean = false;

  async initialize(): Promise<void> {
    cameraLogger.info("PythonGPhoto2Provider: Initializing");

    try {
      // Try to connect to Python service
      await this.connectToService();
      this.connected = true;

      cameraLogger.info("PythonGPhoto2Provider: Initialized successfully");
    } catch (error) {
      cameraLogger.error("PythonGPhoto2Provider: Initialization failed", {
        error,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    cameraLogger.info("PythonGPhoto2Provider: Disconnecting");

    // Stop live view
    await this.stopLiveView().catch(() => {});

    // Disconnect from Python service
    try {
      await fetch(`${PYTHON_SERVICE_URL}/api/v1/camera/disconnect`, {
        method: "POST",
      });
    } catch (error) {
      cameraLogger.debug("PythonGPhoto2Provider: Disconnect error (expected)", {
        error,
      });
    }

    this.connected = false;
    cameraLogger.info("PythonGPhoto2Provider: Disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult> {
    cameraLogger.info("PythonGPhoto2Provider: Capturing photo", {
      sessionId,
      sequenceNumber,
    });

    const startTime = Date.now();

    try {
      const response = await fetch(
        `${PYTHON_SERVICE_URL}/api/v1/camera/capture`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            session_id: sessionId,
            sequence_number: sequenceNumber,
            output_directory: "./photos",
          }),
        },
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Capture failed: ${error}`);
      }

      const result = (await response.json()) as {
        image_path: string;
        metadata?: any;
        capture_time_ms?: number;
      };

      const captureTime = Date.now() - startTime;
      cameraLogger.info("PythonGPhoto2Provider: Photo captured", {
        imagePath: result.image_path,
        captureTimeMs: result.capture_time_ms,
        clientMeasuredMs: captureTime,
      });

      return {
        imagePath: path.join(PYTHON_SERVICE_BASE_DIR, result.image_path),
        metadata: result.metadata,
      };
    } catch (error) {
      cameraLogger.error("PythonGPhoto2Provider: Capture failed", { error });
      throw error;
    }
  }

  async startLiveView(): Promise<void> {
    if (this.liveViewActive) {
      return;
    }

    cameraLogger.info("PythonGPhoto2Provider: Starting live view");

    try {
      // Start live view on Python service
      const response = await fetch(
        `${PYTHON_SERVICE_URL}/api/v1/camera/liveview/start`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to start live view");
      }

      // Connect WebSocket for frames
      await this.connectWebSocket();

      this.liveViewActive = true;
      cameraLogger.info("PythonGPhoto2Provider: Live view started");
    } catch (error) {
      cameraLogger.error("PythonGPhoto2Provider: Failed to start live view", {
        error,
      });
      throw error;
    }
  }

  async stopLiveView(): Promise<void> {
    if (!this.liveViewActive) {
      return;
    }

    cameraLogger.info("PythonGPhoto2Provider: Stopping live view");

    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Stop on Python service
    try {
      await fetch(`${PYTHON_SERVICE_URL}/api/v1/camera/liveview/stop`, {
        method: "POST",
      });
    } catch (error) {
      cameraLogger.debug("PythonGPhoto2Provider: Stop live view error", {
        error,
      });
    }

    this.liveViewActive = false;
    cameraLogger.info("PythonGPhoto2Provider: Live view stopped");
  }

  async getLiveViewFrame(): Promise<Buffer> {
    // Wait for frame lock
    while (this.frameLock) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    this.frameLock = true;
    try {
      // Return latest frame from buffer, or empty if none available
      return this.latestFrame || Buffer.alloc(0);
    } finally {
      this.frameLock = false;
      // Clear buffer after reading (optional - depends on desired behavior)
      // this.latestFrame = null;
    }
  }

  isLiveViewActive(): boolean {
    return this.liveViewActive;
  }

  async setProperty(propertyId: number, value: any): Promise<void> {
    // Properties are handled via config endpoint
    cameraLogger.debug("PythonGPhoto2Provider: setProperty not implemented", {
      propertyId,
      value,
    });
  }

  async getProperty(propertyId: number): Promise<any> {
    // Properties are handled via status endpoint
    return null;
  }

  async getStatus(): Promise<ExtendedCameraStatusResponse> {
    try {
      const response = await fetch(
        `${PYTHON_SERVICE_URL}/api/v1/camera/status`,
      );

      if (!response.ok) {
        throw new Error("Failed to get status");
      }

      const status = (await response.json()) as {
        connected: boolean;
        model?: string;
        battery?: number;
        storage_available?: boolean;
        liveview_active?: boolean;
        capture_count?: number;
        last_capture_at?: string;
      };

      return {
        connected: status.connected,
        model: status.model || "Not Available",
        battery: status.battery || 0,
        storageAvailable: status.storage_available || false,
        settings: {
          iso: "Auto",
          aperture: "Auto",
          shutterSpeed: "Auto",
          whiteBalance: "Auto",
        },
        providerMetadata: {
          provider: "python-gphoto2",
          liveViewActive: status.liveview_active || false,
          captureCount: status.capture_count,
          lastCaptureAt: status.last_capture_at,
        },
      };
    } catch (error) {
      cameraLogger.error("PythonGPhoto2Provider: Failed to get status", {
        error,
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

  async extendShutDownTimer(): Promise<void> {
    // Not needed for gphoto2
  }

  async triggerFocus(): Promise<void> {
    // AF is handled automatically
    cameraLogger.debug("PythonGPhoto2Provider: triggerFocus not needed");
  }

  async cancelCapture(): Promise<void> {
    // Cancel not supported in this implementation
    cameraLogger.debug("PythonGPhoto2Provider: cancelCapture not supported");
  }

  onFrame(callback: (frame: Buffer) => void): () => void {
    this.frameCallbacks.add(callback);
    return () => {
      this.frameCallbacks.delete(callback);
    };
  }

  private async connectToService(): Promise<void> {
    try {
      const response = await fetch(
        `${PYTHON_SERVICE_URL}/api/v1/camera/connect`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to connect to Python service");
      }
    } catch (error) {
      throw new Error(
        `Python camera service not available at ${PYTHON_SERVICE_URL}`,
      );
    }
  }

  private async connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = `${PYTHON_SERVICE_WS_URL}/api/v1/camera/liveview/stream`;

      this.ws = new WebSocket(wsUrl);

      this.ws.on("open", () => {
        cameraLogger.debug("PythonGPhoto2Provider: WebSocket connected");
        this.reconnectAttempts = 0;
        resolve();
      });

      this.ws.on("message", (data: Buffer) => {
        // Store latest frame for pull model (getLiveViewFrame)
        this.latestFrame = data;

        // Also distribute to callbacks for push model support
        for (const callback of this.frameCallbacks) {
          try {
            callback(data);
          } catch (error) {
            cameraLogger.error("PythonGPhoto2Provider: Frame callback error", {
              error,
            });
          }
        }
      });

      this.ws.on("error", (error) => {
        cameraLogger.error("PythonGPhoto2Provider: WebSocket error", { error });
        reject(error);
      });

      this.ws.on("close", () => {
        cameraLogger.debug("PythonGPhoto2Provider: WebSocket closed");
        // Use void to handle async properly
        void this.handleWebSocketClose();
      });
    });
  }

  private async checkCaptureStatus(): Promise<{
    isCapturing: boolean;
    elapsedSeconds?: number;
  }> {
    try {
      const response = await fetch(
        `${PYTHON_SERVICE_URL}/api/v1/camera/capture/status`,
      );
      if (!response.ok) {
        return { isCapturing: false };
      }
      const status = (await response.json()) as {
        is_capturing: boolean;
        elapsed_seconds?: number;
      };
      return {
        isCapturing: status.is_capturing,
        elapsedSeconds: status.elapsed_seconds,
      };
    } catch (error) {
      cameraLogger.debug(
        "PythonGPhoto2Provider: Failed to check capture status",
        { error },
      );
      return { isCapturing: false };
    }
  }

  private async handleWebSocketClose(): Promise<void> {
    if (!this.liveViewActive) {
      return; // Expected close (manually stopped)
    }

    // Add delay before attempting reconnection to prevent rapid connect/disconnect cycles
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Check if still active after delay
    if (!this.liveViewActive) {
      return;
    }

    // Check if capture is in progress
    const captureStatus = await this.checkCaptureStatus();

    if (captureStatus.isCapturing) {
      cameraLogger.info(
        `PythonGPhoto2Provider: Capture in progress (${captureStatus.elapsedSeconds?.toFixed(1)}s), ` +
          `pausing reconnection`,
      );

      // Wait for capture to complete (poll every 500ms)
      const maxWaitTime = 30000; // 30 seconds max
      const pollInterval = 500; // Check every 500ms
      let waitedTime = 0;

      while (waitedTime < maxWaitTime) {
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
        waitedTime += pollInterval;

        const status = await this.checkCaptureStatus();
        if (!status.isCapturing) {
          cameraLogger.info(
            `PythonGPhoto2Provider: Capture completed after ${(waitedTime / 1000).toFixed(1)}s, ` +
              `resuming reconnection`,
          );
          break;
        }
      }

      if (waitedTime >= maxWaitTime) {
        cameraLogger.warn(
          "PythonGPhoto2Provider: Capture timeout, proceeding with reconnection anyway",
        );
      }
    }

    // Attempt reconnection (reset attempts since we waited for capture)
    this.reconnectAttempts = 0;
    await this.attemptReconnection();
  }

  private async attemptReconnection(): Promise<void> {
    while (this.reconnectAttempts < this.maxReconnectAttempts) {
      if (!this.liveViewActive) {
        return; // Live view was manually stopped
      }

      this.reconnectAttempts++;
      cameraLogger.info(
        `PythonGPhoto2Provider: Reconnecting WebSocket (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`,
      );

      try {
        await this.connectWebSocket();
        cameraLogger.info(
          "PythonGPhoto2Provider: WebSocket reconnected successfully",
        );
        this.reconnectAttempts = 0;
        return;
      } catch (error) {
        cameraLogger.error(
          `PythonGPhoto2Provider: Reconnect attempt ${this.reconnectAttempts} failed`,
          { error },
        );

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          const delay = this.reconnectDelay * this.reconnectAttempts;
          cameraLogger.debug(
            `PythonGPhoto2Provider: Waiting ${delay}ms before next attempt`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    cameraLogger.error("PythonGPhoto2Provider: Max reconnect attempts reached");
    this.liveViewActive = false;
  }
}

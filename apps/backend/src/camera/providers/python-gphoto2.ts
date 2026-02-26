/**
 * Python GPhoto2 Provider
 *
 * Communicates with Python camera service via HTTP/WebSocket.
 * Provides fast live view and capture for Canon EOS 550D.
 */

import { EventEmitter } from "events";
import WebSocket from "ws";
import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../types";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";

const PYTHON_SERVICE_URL = env.pythonCameraServiceUrl;
const PYTHON_SERVICE_WS_URL = env.pythonCameraServiceWsUrl;

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

      const result = await response.json();

      const captureTime = Date.now() - startTime;
      cameraLogger.info("PythonGPhoto2Provider: Photo captured", {
        imagePath: result.image_path,
        captureTimeMs: result.capture_time_ms,
        clientMeasuredMs: captureTime,
      });

      return {
        imagePath: result.image_path,
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

      const status = await response.json();

      return {
        connected: status.connected,
        model: status.model,
        battery: status.battery,
        storageAvailable: status.storage_available,
        settings: {
          iso: "Auto",
          aperture: "Auto",
          shutterSpeed: "Auto",
          whiteBalance: "Auto",
        },
        providerMetadata: {
          provider: "python-gphoto2",
          liveViewActive: status.liveview_active,
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
        this.handleWebSocketClose();
      });
    });
  }

  private handleWebSocketClose(): void {
    if (!this.liveViewActive) {
      return; // Expected close
    }

    // Attempt reconnect
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      cameraLogger.info(
        `PythonGPhoto2Provider: Reconnecting WebSocket (attempt ${this.reconnectAttempts})`,
      );

      setTimeout(() => {
        this.connectWebSocket().catch((error) => {
          cameraLogger.error("PythonGPhoto2Provider: Reconnect failed", {
            error,
          });
        });
      }, this.reconnectDelay * this.reconnectAttempts);
    } else {
      cameraLogger.error(
        "PythonGPhoto2Provider: Max reconnect attempts reached",
      );
      this.liveViewActive = false;
    }
  }
}

/**
 * WebSocket client for Python Camera Service
 * Connects to the gphoto2 camera service and provides async interface
 */

import WebSocket from "ws";
import { v4 as uuidv4 } from "uuid";
import { cameraLogger } from "../logger";
import { CameraError } from "../errors";

interface CameraSettings {
  iso?: number;
  aperture?: string;
  shutterSpeed?: string;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
}

export class CameraServiceClient {
  private ws: WebSocket | null = null;
  private url: string;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private messageHandlers: Map<string, (data: any) => void> = new Map();
  private isConnected = false;

  constructor(
    url: string = process.env.CAMERA_SERVICE_URL || "ws://localhost:8080/ws",
  ) {
    this.url = url;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        cameraLogger.info(`Connecting to camera service at ${this.url}`);

        this.ws = new WebSocket(this.url);

        this.ws.on("open", () => {
          cameraLogger.info("Connected to camera service");
          this.isConnected = true;
          this.reconnectAttempts = 0;
          resolve();
        });

        this.ws.on("message", (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on("error", (error: Error) => {
          cameraLogger.error("Camera service WebSocket error:", error);
          if (!this.isConnected) {
            reject(error);
          }
        });

        this.ws.on("close", () => {
          cameraLogger.warn("Camera service connection closed");
          this.isConnected = false;
          this.handleDisconnect();
        });
      } catch (error) {
        cameraLogger.error("Failed to connect to camera service:", error);
        reject(error);
      }
    });
  }

  private handleMessage(message: string): void {
    try {
      const data = JSON.parse(message);
      const requestId = data.requestId;

      // Handle response to pending request
      if (requestId && this.pendingRequests.has(requestId)) {
        const request = this.pendingRequests.get(requestId)!;
        clearTimeout(request.timeout);
        this.pendingRequests.delete(requestId);

        if (data.type === "error") {
          request.reject(
            new CameraError(data.error, {
              operation: data.type,
              timestamp: new Date().toISOString(),
            }),
          );
        } else {
          request.resolve(data);
        }
        return;
      }

      // Handle broadcast messages (preview frames, etc.)
      const handler = this.messageHandlers.get(data.type);
      if (handler) {
        handler(data);
      }
    } catch (error) {
      cameraLogger.error("Failed to parse camera service message:", error);
    }
  }

  private handleDisconnect(): void {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      cameraLogger.info(
        `Attempting to reconnect to camera service (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`,
      );

      setTimeout(() => {
        this.connect().catch((error) => {
          cameraLogger.error("Reconnection failed:", error);
        });
      }, this.reconnectDelay);
    } else {
      cameraLogger.error("Max reconnection attempts reached");
    }
  }

  private sendMessage(
    type: string,
    data: any = {},
    timeout: number = 30000,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected || !this.ws) {
        reject(
          new CameraError("Not connected to camera service", {
            operation: type,
            timestamp: new Date().toISOString(),
          }),
        );
        return;
      }

      const requestId = uuidv4();
      const message = {
        type,
        requestId,
        ...data,
      };

      // Set timeout
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(
          new CameraError("Camera service request timeout", {
            operation: type,
            timestamp: new Date().toISOString(),
          }),
        );
      }, timeout);

      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timeoutId,
      });

      // Send message
      this.ws.send(JSON.stringify(message));
    });
  }

  // Public API methods

  async startPreview(): Promise<void> {
    await this.sendMessage("start_preview");
  }

  async stopPreview(): Promise<void> {
    await this.sendMessage("stop_preview");
  }

  async capturePhoto(
    settings?: CameraSettings,
  ): Promise<{ filename: string; filepath: string; image: string }> {
    return this.sendMessage("capture_photo", { settings });
  }

  async getCameraInfo(): Promise<any> {
    return this.sendMessage("get_camera_info");
  }

  async setSetting(section: string, option: string, value: any): Promise<void> {
    await this.sendMessage("set_camera_setting", { section, option, value });
  }

  async getSetting(section: string, option: string): Promise<any> {
    return this.sendMessage("get_camera_setting", { section, option });
  }

  // Event handlers
  onPreviewFrame(
    callback: (frame: { data: string; timestamp: string }) => void,
  ): void {
    this.messageHandlers.set("preview_frame", callback);
  }

  onError(
    callback: (error: { error: string; timestamp: string }) => void,
  ): void {
    this.messageHandlers.set("error", callback);
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;

    // Clear pending requests
    this.pendingRequests.forEach((request) => {
      clearTimeout(request.timeout);
      request.reject(
        new CameraError("Connection closed", {
          operation: "disconnect",
          timestamp: new Date().toISOString(),
        }),
      );
    });
    this.pendingRequests.clear();
  }

  isReady(): boolean {
    return this.isConnected;
  }
}

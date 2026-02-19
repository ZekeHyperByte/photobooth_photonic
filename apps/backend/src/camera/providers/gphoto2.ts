/**
 * gPhoto2 Camera Provider
 * Uses Python Camera Service via WebSocket for Linux camera control
 */

import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../types";
import { CameraError, CameraNotInitializedError } from "../errors";
import { cameraLogger } from "../logger";
import { CameraServiceClient } from "./gphoto2-client";
import { env } from "../../config/env";

export class GPhoto2Provider implements CameraProvider {
  private client: CameraServiceClient | null = null;
  private isInitialized = false;
  private cameraModel = "Unknown";
  private liveViewActive = false;

  async initialize(): Promise<void> {
    cameraLogger.info("GPhoto2Provider: Initializing gPhoto2 camera provider");

    try {
      // Create client with URL from environment or default
      const serviceUrl =
        process.env.CAMERA_SERVICE_URL || "ws://localhost:8080/ws";
      this.client = new CameraServiceClient(serviceUrl);

      // Connect to camera service
      await this.client.connect();

      // Get camera info
      const cameraInfo = await this.client.getCameraInfo();
      this.cameraModel = cameraInfo.model || "Unknown";

      this.isInitialized = true;

      cameraLogger.info(
        "GPhoto2Provider: gPhoto2 provider initialized successfully",
        {
          model: this.cameraModel,
          url: serviceUrl,
        },
      );
    } catch (error) {
      cameraLogger.error("GPhoto2Provider: Failed to initialize", { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    cameraLogger.info("GPhoto2Provider: Disconnecting camera");

    try {
      if (this.liveViewActive) {
        await this.stopLiveView();
      }

      if (this.client) {
        this.client.disconnect();
        this.client = null;
      }

      this.isInitialized = false;

      cameraLogger.info("GPhoto2Provider: Camera disconnected");
    } catch (error) {
      cameraLogger.error("GPhoto2Provider: Error during disconnect", { error });
      throw error;
    }
  }

  isConnected(): boolean {
    return this.isInitialized && (this.client?.isReady() ?? false);
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("capturePhoto");
    }

    cameraLogger.info("GPhoto2Provider: Capturing photo", {
      sessionId,
      sequenceNumber,
    });

    try {
      // Stop live view if active
      if (this.liveViewActive) {
        await this.stopLiveView();
      }

      // Capture photo via camera service
      const result = await this.client!.capturePhoto();

      // Save image data to file
      const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
      const imagePath = path.join(env.tempPhotoPath, filename);

      if (!fs.existsSync(env.tempPhotoPath)) {
        fs.mkdirSync(env.tempPhotoPath, { recursive: true });
      }

      // Decode base64 image and save
      const imageBuffer = Buffer.from(result.image, "base64");
      fs.writeFileSync(imagePath, imageBuffer);

      cameraLogger.info("GPhoto2Provider: Photo captured successfully", {
        sessionId,
        sequenceNumber,
        imagePath,
        size: imageBuffer.length,
      });

      return {
        imagePath,
        metadata: {
          model: this.cameraModel,
          timestamp: new Date().toISOString(),
          iso: "Auto",
          shutterSpeed: "1/125",
          aperture: "f/5.6",
          focalLength: "18mm",
        },
      };
    } catch (error) {
      cameraLogger.error("GPhoto2Provider: Capture failed", {
        sessionId,
        sequenceNumber,
        error,
      });
      throw error;
    }
  }

  async startLiveView(): Promise<void> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("startLiveView");
    }

    cameraLogger.info("GPhoto2Provider: Starting live view");

    try {
      await this.client!.startPreview();
      this.liveViewActive = true;

      cameraLogger.info("GPhoto2Provider: Live view started");
    } catch (error) {
      cameraLogger.error("GPhoto2Provider: Failed to start live view", {
        error,
      });
      throw error;
    }
  }

  async stopLiveView(): Promise<void> {
    if (!this.liveViewActive) {
      return;
    }

    cameraLogger.info("GPhoto2Provider: Stopping live view");

    try {
      await this.client!.stopPreview();
      this.liveViewActive = false;

      cameraLogger.info("GPhoto2Provider: Live view stopped");
    } catch (error) {
      cameraLogger.error("GPhoto2Provider: Error stopping live view", {
        error,
      });
      throw error;
    }
  }

  async getLiveViewFrame(): Promise<Buffer> {
    if (!this.liveViewActive) {
      throw new CameraError("Live view not started", {
        operation: "getLiveViewFrame",
        timestamp: new Date().toISOString(),
      });
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new CameraError("Live view frame timeout", {
            operation: "getLiveViewFrame",
            timestamp: new Date().toISOString(),
          }),
        );
      }, 5000);

      this.client!.onPreviewFrame((frame) => {
        clearTimeout(timeout);
        const buffer = Buffer.from(frame.data, "base64");
        resolve(buffer);
      });
    });
  }

  async getStatus(): Promise<ExtendedCameraStatusResponse> {
    if (!this.isConnected()) {
      return {
        connected: false,
        model: "No camera detected",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }

    try {
      const cameraInfo = await this.client!.getCameraInfo();

      return {
        connected: true,
        model: this.cameraModel,
        battery: cameraInfo.batteryLevel || 100,
        storageAvailable: true,
        settings: cameraInfo.settings || {},
        providerMetadata: {
          serviceVersion: "1.0",
          url: process.env.CAMERA_SERVICE_URL || "ws://localhost:8080/ws",
        },
      };
    } catch (error) {
      cameraLogger.error("GPhoto2Provider: Failed to get status", { error });
      throw error;
    }
  }

  async extendShutDownTimer(): Promise<void> {
    // Not implemented for gPhoto2 - cameras stay awake via active connection
    cameraLogger.debug("GPhoto2Provider: extendShutDownTimer is a no-op");
  }

  async triggerFocus(): Promise<void> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("triggerFocus");
    }

    // gPhoto2 focus control - if supported by camera service
    cameraLogger.debug("GPhoto2Provider: Focus triggered");
  }

  async setProperty(propertyId: number, value: any): Promise<void> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("setProperty");
    }

    // gPhoto2 properties are set via camera service settings
    // This is a simplified implementation
    cameraLogger.debug("GPhoto2Provider: Setting property", {
      propertyId,
      value,
    });
  }

  async getProperty(propertyId: number): Promise<any> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("getProperty");
    }

    // gPhoto2 properties are retrieved via camera service
    // This is a simplified implementation
    cameraLogger.debug("GPhoto2Provider: Getting property", { propertyId });
    return null;
  }
}

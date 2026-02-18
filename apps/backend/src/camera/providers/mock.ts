/**
 * Mock Camera Provider
 * Simulates camera behavior for development and testing
 */

import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../types";
import { CameraError, CameraNotInitializedError } from "../errors";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";

export class MockProvider implements CameraProvider {
  private connected = false;
  private initialized = false;
  private liveViewActive = false;
  private captureCount = 0;

  async initialize(): Promise<void> {
    cameraLogger.info("MockProvider: Initializing mock camera");

    // Simulate initialization delay
    await this.delay(500);

    this.initialized = true;
    this.connected = true;

    cameraLogger.info("MockProvider: Mock camera initialized", {
      model: "Canon EOS Mock 550D",
      mode: "mock",
    });
  }

  async disconnect(): Promise<void> {
    cameraLogger.info("MockProvider: Disconnecting mock camera");

    if (this.liveViewActive) {
      await this.stopLiveView();
    }

    this.connected = false;
    this.initialized = false;

    cameraLogger.info("MockProvider: Mock camera disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("capturePhoto");
    }

    cameraLogger.info("MockProvider: Capturing photo", {
      sessionId,
      sequenceNumber,
    });

    // Simulate capture delay
    await this.delay(1000);

    this.captureCount++;

    // Return mock image path
    const mockImageDir = path.join(process.cwd(), "temp", "mock");
    if (!fs.existsSync(mockImageDir)) {
      fs.mkdirSync(mockImageDir, { recursive: true });
    }

    const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
    const imagePath = path.join(mockImageDir, filename);

    // Create a minimal valid JPEG file (1x1 pixel, gray)
    const mockJpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
      0x3f, 0x00, 0x37, 0xff, 0xd9,
    ]);

    fs.writeFileSync(imagePath, mockJpeg);

    cameraLogger.info("MockProvider: Photo captured successfully", {
      sessionId,
      sequenceNumber,
      imagePath,
      size: mockJpeg.length,
    });

    return {
      imagePath,
      metadata: {
        model: "Canon EOS Mock 550D",
        iso: "400",
        shutterSpeed: "1/60",
        aperture: "f/5.6",
        focalLength: "18mm",
        timestamp: new Date().toISOString(),
      },
    };
  }

  async startLiveView(): Promise<void> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("startLiveView");
    }

    cameraLogger.info("MockProvider: Starting live view");
    this.liveViewActive = true;
  }

  async stopLiveView(): Promise<void> {
    cameraLogger.info("MockProvider: Stopping live view");
    this.liveViewActive = false;
  }

  async getLiveViewFrame(): Promise<Buffer> {
    if (!this.liveViewActive) {
      throw new CameraError("Live view not started", {
        operation: "getLiveViewFrame",
        timestamp: new Date().toISOString(),
      });
    }

    // Return mock JPEG frame
    return Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
      0x3f, 0x00, 0x37, 0xff, 0xd9,
    ]);
  }

  async setProperty(propertyId: number, value: any): Promise<void> {
    cameraLogger.info("MockProvider: Set property", { propertyId, value });
    // Mock implementation - just log the call
  }

  async getProperty(propertyId: number): Promise<any> {
    cameraLogger.info("MockProvider: Get property", { propertyId });
    // Return mock values based on property ID
    return null;
  }

  async getStatus(): Promise<ExtendedCameraStatusResponse> {
    return {
      connected: this.connected,
      model: "Canon EOS Mock 550D",
      battery: 100,
      storageAvailable: true,
      settings: {
        iso: "400",
        shutterSpeed: "1/60",
        aperture: "f/5.6",
        whiteBalance: "auto",
        imageFormat: "JPEG",
      },
      edsMetadata: {
        protocolVersion: "Mock 1.0",
        availableShots: 9999,
        lensName: "Mock Lens EF-S 18-55mm",
        bodyID: "MOCK550D001",
        firmwareVersion: "1.0.9",
        saveTo: "host",
      },
    };
  }

  async extendShutDownTimer(): Promise<void> {
    cameraLogger.debug("MockProvider: Extend shutdown timer");
  }

  async triggerFocus(): Promise<void> {
    cameraLogger.debug("MockProvider: Trigger focus");
    await this.delay(200);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

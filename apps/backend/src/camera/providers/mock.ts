/**
 * Mock Camera Provider
 * Simulates camera behavior for development and testing
 * Supports failure simulation modes via MOCK_FAILURE_MODE env var
 */

import { nanoid } from "nanoid";
import path from "path";
import fs from "fs";
import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../types";
import {
  CameraError,
  CameraErrorContext,
  CameraNotInitializedError,
  CameraNotReadyError,
  CaptureTimeoutError,
  CardFullError,
  CamerasBusyError,
} from "../errors";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";

export type FailureMode =
  | "none"
  | "disconnect"
  | "timeout"
  | "card_full"
  | "flaky"
  | "no_af";

export class MockProvider implements CameraProvider {
  private connected = false;
  private initialized = false;
  private liveViewActive = false;
  private captureCount = 0;
  private failureMode: FailureMode;
  private disconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private initTime: number = 0;

  constructor() {
    this.failureMode = (env.mockFailureMode || "none") as FailureMode;
    cameraLogger.info(
      `MockProvider: Initialized with failure mode: ${this.failureMode}`,
    );
  }

  async initialize(): Promise<void> {
    cameraLogger.info("MockProvider: Initializing mock camera", {
      failureMode: this.failureMode,
    });

    // Simulate initialization delay
    await this.delay(500);

    // Check for failure simulation
    if (this.failureMode === "disconnect") {
      // Schedule disconnect after 30 seconds
      this.scheduleDisconnect();
    }

    this.initialized = true;
    this.connected = true;
    this.initTime = Date.now();

    cameraLogger.info("MockProvider: Mock camera initialized", {
      model: "Canon EOS Mock 550D",
      mode: "mock",
      failureMode: this.failureMode,
    });
  }

  async disconnect(): Promise<void> {
    cameraLogger.info("MockProvider: Disconnecting mock camera");

    if (this.disconnectTimer) {
      clearTimeout(this.disconnectTimer);
      this.disconnectTimer = null;
    }

    if (this.liveViewActive) {
      await this.stopLiveView();
    }

    this.connected = false;
    this.initialized = false;

    cameraLogger.info("MockProvider: Mock camera disconnected");
  }

  isConnected(): boolean {
    // Simulate disconnect failure mode
    if (this.failureMode === "disconnect" && this.connected) {
      const elapsed = Date.now() - this.initTime;
      if (elapsed > 30000) {
        // Disconnect after 30 seconds
        this.connected = false;
        cameraLogger.warn("MockProvider: Simulated disconnect after 30s");
      }
    }
    return this.connected;
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult> {
    if (!this.isConnected()) {
      throw new CameraNotInitializedError("capturePhoto", sessionId);
    }

    // Check for AF failure before shutter fires
    if (this.failureMode === "no_af") {
      throw new CameraNotReadyError("Auto-focus failed to acquire lock", {
        operation: "capture",
        sessionId,
      });
    }

    cameraLogger.info("MockProvider: Capturing photo", {
      sessionId,
      sequenceNumber,
      failureMode: this.failureMode,
    });

    // Simulate failure modes
    await this.simulateFailures("capture");

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

  async getStatus(_options?: { includeSettings?: boolean }): Promise<ExtendedCameraStatusResponse> {
    // Simulate battery drain in disconnect mode
    let battery = 100;
    if (this.failureMode === "disconnect" && this.connected) {
      const elapsed = Date.now() - this.initTime;
      battery = Math.max(0, 100 - Math.floor(elapsed / 1000));
    }

    return {
      connected: this.isConnected(),
      model: "Canon EOS Mock 550D",
      battery,
      storageAvailable: true,
      settings: {
        iso: "400",
        shutterSpeed: "1/60",
        aperture: "f/5.6",
        whiteBalance: "auto",
        imageFormat: "JPEG",
      },
      providerMetadata: {
        protocolVersion: "Mock 1.0",
        availableShots: 9999,
        lensName: "Mock Lens EF-S 18-55mm",
        bodyID: "MOCK550D001",
        firmwareVersion: "1.0.9",
        saveTo: "host",
        failureMode: this.failureMode,
      },
    };
  }

  async extendShutDownTimer(): Promise<void> {
    cameraLogger.debug("MockProvider: Extend shutdown timer");
  }

  async triggerFocus(): Promise<void> {
    cameraLogger.debug("MockProvider: Trigger focus");

    // Simulate AF failure
    if (this.failureMode === "no_af") {
      throw new CameraError("AF failed", {
        operation: "triggerFocus",
      } as CameraErrorContext);
    }

    await this.delay(200);
  }

  /**
   * Simulate failure modes
   */
  private async simulateFailures(operation: string): Promise<void> {
    switch (this.failureMode) {
      case "timeout":
        throw new CaptureTimeoutError(30000, { operation });

      case "card_full":
        throw new CardFullError({ operation });

      case "flaky":
        // 30% random failure
        if (Math.random() < 0.3) {
          throw new CamerasBusyError({ operation });
        }
        break;

      default:
        // No failure
        break;
    }
  }

  /**
   * Schedule disconnect after 30 seconds
   */
  private scheduleDisconnect(): void {
    cameraLogger.info("MockProvider: Scheduling disconnect in 30 seconds");
    this.disconnectTimer = setTimeout(() => {
      cameraLogger.warn("MockProvider: Simulating disconnect");
      this.connected = false;
    }, 30000);
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

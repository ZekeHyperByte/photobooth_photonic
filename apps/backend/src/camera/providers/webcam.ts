/**
 * Webcam Camera Provider
 *
 * Provider that uses the browser/OS webcam through the frontend.
 * This is a stub provider - actual webcam access happens in the browser.
 * The backend just validates that webcam mode is active.
 */

import {
  CameraProvider,
  CaptureResult,
  ExtendedCameraStatusResponse,
} from "../types";
import { CameraNotInitializedError } from "../errors";
import { cameraLogger } from "../logger";

export class WebcamProvider implements CameraProvider {
  private connected = false;
  private initialized = false;

  async initialize(): Promise<void> {
    cameraLogger.info("WebcamProvider: Initializing webcam provider");

    // Webcam is managed by the browser, so we just mark as ready
    this.initialized = true;
    this.connected = true;

    cameraLogger.info("WebcamProvider: Webcam provider initialized", {
      mode: "webcam",
    });
  }

  async disconnect(): Promise<void> {
    cameraLogger.info("WebcamProvider: Disconnecting webcam provider");

    this.connected = false;
    this.initialized = false;

    cameraLogger.info("WebcamProvider: Webcam provider disconnected");
  }

  isConnected(): boolean {
    return this.connected;
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult> {
    // Webcam captures happen in the browser and are uploaded via photoService.upload()
    // This method should not be called directly for webcam mode
    throw new CameraNotInitializedError(
      "capturePhoto",
      "Webcam captures must be done via browser upload, not EDSDK capture",
    );
  }

  async startLiveView(): Promise<void> {
    // Live view is handled by the browser getUserMedia API
    cameraLogger.debug("WebcamProvider: Live view started (browser handled)");
  }

  async stopLiveView(): Promise<void> {
    // Live view is handled by the browser getUserMedia API
    cameraLogger.debug("WebcamProvider: Live view stopped (browser handled)");
  }

  async getLiveViewFrame(): Promise<Buffer> {
    // Live view frames come from browser, not backend
    return Buffer.alloc(0);
  }

  async setProperty(_propertyId: number, _value: any): Promise<void> {
    // Webcam properties are controlled by browser
    cameraLogger.debug("WebcamProvider: Set property (no-op)");
  }

  async getProperty(_propertyId: number): Promise<any> {
    // Webcam properties come from browser
    return null;
  }

  async getStatus(_options?: { includeSettings?: boolean }): Promise<ExtendedCameraStatusResponse> {
    return {
      connected: this.connected,
      model: "Webcam",
      battery: 100,
      storageAvailable: true,
      settings: {
        iso: "Auto",
        shutterSpeed: "Auto",
        aperture: "Auto",
        whiteBalance: "Auto",
        imageFormat: "JPEG",
      },
      providerMetadata: {
        provider: "webcam",
        mode: "browser",
      },
    };
  }

  async extendShutDownTimer(): Promise<void> {
    // No-op for webcam
  }

  async triggerFocus(): Promise<void> {
    // Webcam focus is handled by browser
    cameraLogger.debug("WebcamProvider: Trigger focus (browser handled)");
  }
}

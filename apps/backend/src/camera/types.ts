/**
 * Camera module type definitions
 */

import {
  CameraMetadata,
  CameraSettings,
  CameraStatusResponse,
} from "@photonic/types";

/**
 * Camera capture result
 */
export interface CaptureResult {
  /** Path to captured image file */
  imagePath: string;
  /** Camera metadata */
  metadata: CameraMetadata;
}

/**
 * Extended camera status with provider-specific metadata
 */
export interface ExtendedCameraStatusResponse extends CameraStatusResponse {
  /** Provider-specific metadata (varies by camera implementation) */
  providerMetadata?: Record<string, any>;
}

/**
 * Camera property values
 */
export interface CameraProperties {
  iso?: number;
  aperture?: number;
  shutterSpeed?: number;
  whiteBalance?: number;
  exposureCompensation?: number;
  imageQuality?: number;
}

/**
 * Live view frame data
 */
export interface LiveViewFrame {
  /** JPEG image buffer */
  data: Buffer;
  /** Timestamp */
  timestamp: number;
  /** Frame dimensions */
  dimensions?: {
    width: number;
    height: number;
  };
}

/**
 * Camera provider interface
 * All camera implementations must implement this interface
 */
export interface CameraProvider {
  // Lifecycle

  /**
   * Initialize the camera provider
   */
  initialize(): Promise<void>;

  /**
   * Disconnect and cleanup camera resources
   */
  disconnect(): Promise<void>;

  /**
   * Check if camera is connected and ready
   */
  isConnected(): boolean;

  // Capture

  /**
   * Capture a photo
   * @param sessionId - Session identifier
   * @param sequenceNumber - Photo sequence number in session
   */
  capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<CaptureResult>;

  // Live View

  /**
   * Start live view streaming
   */
  startLiveView(): Promise<void>;

  /**
   * Stop live view streaming
   */
  stopLiveView(): Promise<void>;

  /**
   * Get a single live view frame
   */
  getLiveViewFrame(): Promise<Buffer>;

  // Settings

  /**
   * Set a camera property
   * @param propertyId - EDSDK property ID
   * @param value - Property value
   */
  setProperty(propertyId: number, value: any): Promise<void>;

  /**
   * Get a camera property value
   * @param propertyId - EDSDK property ID
   */
  getProperty(propertyId: number): Promise<any>;

  // Status

  /**
   * Get camera status and information
   */
  getStatus(): Promise<ExtendedCameraStatusResponse>;

  // Utility

  /**
   * Extend camera shutdown timer
   */
  extendShutDownTimer(): Promise<void>;

  /**
   * Trigger auto-focus
   */
  triggerFocus(): Promise<void>;
}

/**
 * Camera provider factory function type
 */
export type CameraProviderFactory = () => CameraProvider;

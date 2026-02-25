/**
 * Camera Manager
 *
 * Manages multiple camera connections with discovery, selection, and failover.
 * Provides a higher-level abstraction over individual CameraProvider instances.
 */

import { EventEmitter } from "events";
import { cameraLogger } from "./logger";
import type {
  CameraProvider,
  CameraInfo,
  ExtendedCameraStatusResponse,
} from "./types";
import { EdsdkProvider } from "./providers/edsdk";
import { MockProvider } from "./providers/mock";
import { WebcamProvider } from "./providers/webcam";
import { CameraNotInitializedError, CameraError } from "./errors";

export interface CameraManagerOptions {
  enableFailover?: boolean;
  enableDiscovery?: boolean;
}

export interface CameraEvent {
  type:
    | "connected"
    | "disconnected"
    | "ready"
    | "busy"
    | "error"
    | "battery:low";
  cameraId: string;
  data?: any;
  timestamp: string;
}

export class CameraManager extends EventEmitter {
  private providers: Map<string, CameraProvider> = new Map();
  private cameras: Map<string, CameraInfo> = new Map();
  private activeCameraId: string | null = null;
  private standbyCameraId: string | null = null;
  private initialized = false;
  private options: CameraManagerOptions;

  constructor(options: CameraManagerOptions = {}) {
    super();
    this.options = {
      enableFailover: true,
      enableDiscovery: true,
      ...options,
    };
  }

  /**
   * Initialize the camera manager
   */
  async initialize(): Promise<void> {
    cameraLogger.info("CameraManager: Initializing");

    if (this.initialized) {
      cameraLogger.debug("CameraManager: Already initialized");
      return;
    }

    // Discover available cameras
    if (this.options.enableDiscovery) {
      await this.discoverCameras();
    }

    // Initialize the first available camera
    if (this.cameras.size > 0) {
      const firstCamera = Array.from(this.cameras.values())[0];
      await this.selectCamera(firstCamera.id);
    }

    this.initialized = true;
    cameraLogger.info("CameraManager: Initialized", {
      cameraCount: this.cameras.size,
      activeCamera: this.activeCameraId,
    });
  }

  /**
   * Disconnect all cameras and cleanup
   */
  async disconnect(): Promise<void> {
    cameraLogger.info("CameraManager: Disconnecting all cameras");

    for (const [id, provider] of this.providers) {
      try {
        await provider.disconnect();
        cameraLogger.debug(`CameraManager: Disconnected camera ${id}`);
      } catch (error) {
        cameraLogger.error(`CameraManager: Error disconnecting camera ${id}`, {
          error,
        });
      }
    }

    this.providers.clear();
    this.cameras.clear();
    this.activeCameraId = null;
    this.standbyCameraId = null;
    this.initialized = false;

    cameraLogger.info("CameraManager: All cameras disconnected");
  }

  /**
   * Discover available cameras
   */
  async discoverCameras(): Promise<CameraInfo[]> {
    cameraLogger.info("CameraManager: Discovering cameras");

    const discovered: CameraInfo[] = [];

    // Try to discover EDSDK cameras
    try {
      const edsdkProvider = new EdsdkProvider();
      await edsdkProvider.initialize();

      if (edsdkProvider.isConnected()) {
        const status = await edsdkProvider.getStatus();
        const cameraId = `edsdk-${Date.now()}`;

        const cameraInfo: CameraInfo = {
          id: cameraId,
          model: status.model || "Canon Camera",
          port: "USB",
          serialNumber: status.serialNumber ?? undefined,
          isActive: false,
          isStandby: false,
        };

        discovered.push(cameraInfo);
        this.providers.set(cameraId, edsdkProvider);
        this.cameras.set(cameraId, cameraInfo);

        cameraLogger.info(
          `CameraManager: Discovered EDSDK camera: ${status.model}`,
        );
      } else {
        // Clean up if not connected
        await edsdkProvider.disconnect();
      }
    } catch (error) {
      const errorDetails = error instanceof Error ? {
        message: error.message,
        name: error.name,
        stack: error.stack,
      } : { error: String(error) };
      
      cameraLogger.error("CameraManager: Failed to initialize EDSDK camera", {
        ...errorDetails,
        hint: "Check that EDSDK.dll dependencies are installed (Visual C++ Redistributables)"
      });
    }

    // Add mock camera for testing
    if (discovered.length === 0 || process.env.NODE_ENV === "development") {
      const mockId = `mock-${Date.now()}`;
      const mockProvider = new MockProvider();
      await mockProvider.initialize();

      const mockInfo: CameraInfo = {
        id: mockId,
        model: "Mock Camera",
        port: "virtual",
        isActive: false,
        isStandby: false,
      };

      discovered.push(mockInfo);
      this.providers.set(mockId, mockProvider);
      this.cameras.set(mockId, mockInfo);

      cameraLogger.info("CameraManager: Added mock camera");
    }

    // Add webcam option
    const webcamId = `webcam-${Date.now()}`;
    const webcamProvider = new WebcamProvider();
    await webcamProvider.initialize();

    const webcamInfo: CameraInfo = {
      id: webcamId,
      model: "Webcam",
      port: "browser",
      isActive: false,
      isStandby: false,
    };

    discovered.push(webcamInfo);
    this.providers.set(webcamId, webcamProvider);
    this.cameras.set(webcamId, webcamInfo);

    cameraLogger.info(
      `CameraManager: Discovery complete, found ${discovered.length} camera(s)`,
    );
    return discovered;
  }

  /**
   * Select a camera as the active camera
   */
  async selectCamera(cameraId: string): Promise<void> {
    cameraLogger.info(`CameraManager: Selecting camera ${cameraId}`);

    const camera = this.cameras.get(cameraId);
    if (!camera) {
      throw new CameraError(`Camera ${cameraId} not found`, {
        operation: "selectCamera",
        timestamp: new Date().toISOString(),
      });
    }

    // Disconnect current active camera if different
    if (this.activeCameraId && this.activeCameraId !== cameraId) {
      const currentProvider = this.providers.get(this.activeCameraId);
      if (currentProvider) {
        try {
          await currentProvider.disconnect();
        } catch (error) {
          cameraLogger.warn(
            `CameraManager: Error disconnecting previous camera`,
            { error },
          );
        }
      }

      // Update previous active camera status
      const prevCamera = this.cameras.get(this.activeCameraId);
      if (prevCamera) {
        prevCamera.isActive = false;
      }
    }

    // Connect new camera if not connected
    const provider = this.providers.get(cameraId);
    if (!provider) {
      throw new CameraNotInitializedError("selectCamera");
    }

    if (!provider.isConnected()) {
      await provider.initialize();
    }

    // Update camera status
    camera.isActive = true;
    camera.isStandby = false;
    this.activeCameraId = cameraId;

    // Clear standby if same camera
    if (this.standbyCameraId === cameraId) {
      this.standbyCameraId = null;
    }

    this.emit("camera:selected", {
      cameraId,
      model: camera.model,
      timestamp: new Date().toISOString(),
    });

    cameraLogger.info(
      `CameraManager: Camera ${cameraId} (${camera.model}) is now active`,
    );
  }

  /**
   * Set a camera as standby (failover backup)
   */
  async setStandby(cameraId: string): Promise<void> {
    cameraLogger.info(`CameraManager: Setting camera ${cameraId} as standby`);

    const camera = this.cameras.get(cameraId);
    if (!camera) {
      throw new CameraError(`Camera ${cameraId} not found`, {
        operation: "setStandby",
        timestamp: new Date().toISOString(),
      });
    }

    // Can't set active camera as standby
    if (this.activeCameraId === cameraId) {
      throw new CameraError("Cannot set active camera as standby", {
        operation: "setStandby",
        timestamp: new Date().toISOString(),
      });
    }

    // Ensure camera is connected
    const provider = this.providers.get(cameraId);
    if (provider && !provider.isConnected()) {
      await provider.initialize();
    }

    // Update previous standby
    if (this.standbyCameraId) {
      const prevStandby = this.cameras.get(this.standbyCameraId);
      if (prevStandby) {
        prevStandby.isStandby = false;
      }
    }

    // Set new standby
    camera.isStandby = true;
    this.standbyCameraId = cameraId;

    this.emit("camera:standby", {
      cameraId,
      model: camera.model,
      timestamp: new Date().toISOString(),
    });

    cameraLogger.info(`CameraManager: Camera ${cameraId} is now standby`);
  }

  /**
   * Failover to standby camera
   */
  async failoverToStandby(): Promise<boolean> {
    if (!this.standbyCameraId) {
      cameraLogger.warn(
        "CameraManager: No standby camera available for failover",
      );
      return false;
    }

    cameraLogger.info(
      `CameraManager: Failing over to standby camera ${this.standbyCameraId}`,
    );

    try {
      await this.selectCamera(this.standbyCameraId);

      this.emit("camera:failover", {
        fromCameraId: this.activeCameraId,
        toCameraId: this.standbyCameraId,
        timestamp: new Date().toISOString(),
      });

      return true;
    } catch (error) {
      cameraLogger.error("CameraManager: Failover failed", { error });
      return false;
    }
  }

  /**
   * Get the active camera provider
   */
  getActiveProvider(): CameraProvider {
    if (!this.activeCameraId) {
      throw new CameraNotInitializedError("getActiveProvider");
    }

    const provider = this.providers.get(this.activeCameraId);
    if (!provider) {
      throw new CameraNotInitializedError("getActiveProvider");
    }

    return provider;
  }

  /**
   * Get active camera ID
   */
  getActiveCameraId(): string | null {
    return this.activeCameraId;
  }

  /**
   * Get standby camera ID
   */
  getStandbyCameraId(): string | null {
    return this.standbyCameraId;
  }

  /**
   * Get all discovered cameras
   */
  getCameras(): CameraInfo[] {
    return Array.from(this.cameras.values());
  }

  /**
   * Get camera info by ID
   */
  getCamera(cameraId: string): CameraInfo | undefined {
    return this.cameras.get(cameraId);
  }

  /**
   * Forward method calls to active provider
   */
  async capturePhoto(sessionId: string, sequenceNumber: number): Promise<any> {
    const provider = this.getActiveProvider();
    return provider.capturePhoto(sessionId, sequenceNumber);
  }

  async startLiveView(): Promise<void> {
    const provider = this.getActiveProvider();
    return provider.startLiveView();
  }

  async stopLiveView(): Promise<void> {
    const provider = this.getActiveProvider();
    return provider.stopLiveView();
  }

  async getLiveViewFrame(): Promise<Buffer> {
    const provider = this.getActiveProvider();
    return provider.getLiveViewFrame();
  }

  async getStatus(): Promise<ExtendedCameraStatusResponse> {
    const provider = this.getActiveProvider();
    return provider.getStatus();
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
let cameraManager: CameraManager | null = null;

export function getCameraManager(
  options?: CameraManagerOptions,
): CameraManager {
  if (!cameraManager) {
    cameraManager = new CameraManager(options);
  }
  return cameraManager;
}

export function resetCameraManager(): void {
  if (cameraManager) {
    cameraManager.disconnect().catch(() => {});
    cameraManager = null;
  }
}

/**
 * Session Manager
 *
 * Manages EDSDK session lifecycle, reference counting, and resource cleanup.
 * Guarantees proper cleanup even when errors occur.
 */

import * as C from "../bindings/constants";
import {
  EdsdkBindings,
  loadEdsdkLibrary,
  unloadEdsdkLibrary,
} from "../bindings/edsdk-bindings";
import { TrackedObject, SessionConfig, CameraInfo } from "./types";
import { cameraLogger } from "../logger";
import {
  CameraNotConnectedError,
  EdsSdkError,
  mapEdsErrorToTypedError,
} from "../errors";

export class SessionManager {
  private sdk: EdsdkBindings | null = null;
  private cameraRef: any = null;
  private cameraListRef: any = null;
  private cameraModel: string = "Unknown";
  private isInitialized: boolean = false;
  private isSessionOpen: boolean = false;
  private trackedObjects: Map<any, TrackedObject> = new Map();

  // Event handler references (stored to prevent GC)
  private objectEventHandler: any = null;
  private propertyEventHandler: any = null;
  private stateEventHandler: any = null;

  // Registered callback handles
  private registeredObjectHandler: any = null;
  private registeredPropertyHandler: any = null;
  private registeredStateHandler: any = null;

  // Event callbacks
  private onObjectEvent?: (event: number, ref: any) => void;
  private onPropertyEvent?: (propertyId: number, value: any) => void;
  private onStateEvent?: (event: number, param: number) => void;

  constructor(
    private onObjectEventCallback?: (event: number, ref: any) => void,
    private onPropertyEventCallback?: (propertyId: number, value: any) => void,
    private onStateEventCallback?: (event: number, param: number) => void
  ) {
    this.onObjectEvent = onObjectEventCallback;
    this.onPropertyEvent = onPropertyEventCallback;
    this.onStateEvent = onStateEventCallback;
  }

  /**
   * Initialize EDSDK and connect to camera
   *
   * @returns Camera information
   */
  async initialize(): Promise<CameraInfo> {
    cameraLogger.info("SessionManager: Initializing EDSDK");

    try {
      // Load the SDK library
      this.sdk = loadEdsdkLibrary();
      cameraLogger.info("SessionManager: EDSDK library loaded");

      // Initialize the SDK
      const initErr = this.sdk.EdsInitializeSDK();
      if (initErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(initErr, { operation: "EdsInitializeSDK" });
      }
      this.isInitialized = true;
      cameraLogger.info("SessionManager: EDSDK initialized");

      // Get camera list
      const cameraListOut = [null];
      const listErr = this.sdk.EdsGetCameraList(cameraListOut);
      if (listErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(listErr, { operation: "EdsGetCameraList" });
      }
      this.cameraListRef = cameraListOut[0];
      this.trackObject(this.cameraListRef, "CameraList");

      // Check camera count
      const countOut = [0];
      const countErr = this.sdk.EdsGetChildCount(this.cameraListRef, countOut);
      if (countErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(countErr, { operation: "EdsGetChildCount" });
      }

      if (countOut[0] === 0) {
        throw new CameraNotConnectedError({ operation: "initialize" });
      }

      cameraLogger.info(`SessionManager: Found ${countOut[0]} camera(s)`);

      // Get first camera
      const cameraOut = [null];
      const childErr = this.sdk.EdsGetChildAtIndex(
        this.cameraListRef,
        0,
        cameraOut
      );
      if (childErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(childErr, {
          operation: "EdsGetChildAtIndex",
        });
      }
      this.cameraRef = cameraOut[0];
      this.trackObject(this.cameraRef, "Camera");

      // Get device info
      const deviceInfo: any = {};
      const infoErr = this.sdk.EdsGetDeviceInfo(this.cameraRef, deviceInfo);
      if (infoErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(infoErr, { operation: "EdsGetDeviceInfo" });
      }

      this.cameraModel = deviceInfo.szDeviceDescription || "Canon Camera";
      cameraLogger.info(`SessionManager: Camera model: ${this.cameraModel}`);

      // Open session
      const sessionErr = this.sdk.EdsOpenSession(this.cameraRef);
      if (sessionErr !== C.EDS_ERR_OK) {
        throw mapEdsErrorToTypedError(sessionErr, { operation: "EdsOpenSession" });
      }
      this.isSessionOpen = true;
      cameraLogger.info("SessionManager: Session opened");

      // Set up event handlers
      this.setupEventHandlers();

      // Set save target to host
      await this.setSaveToHost();

      // Get battery level and other info
      const batteryLevel = await this.getBatteryLevel();
      const availableShots = await this.getAvailableShots();

      return {
        model: this.cameraModel,
        portName: deviceInfo.szPortName || "USB",
        batteryLevel: batteryLevel ?? 100,
        availableShots: availableShots ?? 0,
      };
    } catch (error) {
      // Clean up on failure
      await this.cleanup();
      throw error;
    }
  }

  /**
   * Close session and cleanup all resources
   */
  async disconnect(): Promise<void> {
    cameraLogger.info("SessionManager: Disconnecting");
    await this.cleanup();
    cameraLogger.info("SessionManager: Disconnected");
  }

  /**
   * Check if session is active
   */
  isActive(): boolean {
    return this.isSessionOpen && this.cameraRef !== null;
  }

  /**
   * Get SDK bindings
   */
  getSdk(): EdsdkBindings {
    if (!this.sdk) {
      throw new Error("EDSDK not initialized");
    }
    return this.sdk;
  }

  /**
   * Get camera reference
   */
  getCameraRef(): any {
    if (!this.cameraRef) {
      throw new Error("Camera not connected");
    }
    return this.cameraRef;
  }

  /**
   * Get camera model name
   */
  getCameraModel(): string {
    return this.cameraModel;
  }

  /**
   * Create a memory stream
   */
  createMemoryStream(size: bigint = BigInt(0)): any {
    const sdk = this.getSdk();
    const streamOut = [null];
    const err = sdk.EdsCreateMemoryStream(size, streamOut);

    if (err !== C.EDS_ERR_OK) {
      throw mapEdsErrorToTypedError(err, { operation: "EdsCreateMemoryStream" });
    }

    this.trackObject(streamOut[0], "MemoryStream");
    return streamOut[0];
  }

  /**
   * Create an EVF image reference
   */
  createEvfImageRef(stream: any): any {
    const sdk = this.getSdk();
    const evfOut = [null];
    const err = sdk.EdsCreateEvfImageRef(stream, evfOut);

    if (err !== C.EDS_ERR_OK) {
      throw mapEdsErrorToTypedError(err, { operation: "EdsCreateEvfImageRef" });
    }

    this.trackObject(evfOut[0], "EvfImage");
    return evfOut[0];
  }

  /**
   * Release an object
   */
  release(ref: any): void {
    if (!ref || !this.sdk) return;

    try {
      this.sdk.EdsRelease(ref);
      this.trackedObjects.delete(ref);
    } catch (error) {
      cameraLogger.debug(`SessionManager: Error releasing object: ${error}`);
    }
  }

  /**
   * Get battery level
   */
  async getBatteryLevel(): Promise<number | null> {
    if (!this.sdk || !this.cameraRef) return null;

    const buf = Buffer.alloc(4);
    const err = this.sdk.EdsGetPropertyData(
      this.cameraRef,
      C.kEdsPropID_BatteryLevel,
      0,
      4,
      buf
    );

    if (err === C.EDS_ERR_OK) {
      return buf.readUInt32LE(0);
    }

    return null;
  }

  /**
   * Get available shots
   */
  async getAvailableShots(): Promise<number | null> {
    if (!this.sdk || !this.cameraRef) return null;

    const buf = Buffer.alloc(4);
    const err = this.sdk.EdsGetPropertyData(
      this.cameraRef,
      C.kEdsPropID_AvailableShots,
      0,
      4,
      buf
    );

    if (err === C.EDS_ERR_OK) {
      return buf.readUInt32LE(0);
    }

    return null;
  }

  /**
   * Set save target to host
   */
  private async setSaveToHost(): Promise<void> {
    if (!this.sdk || !this.cameraRef) return;

    const saveTo = Buffer.alloc(4);
    saveTo.writeUInt32LE(C.kEdsSaveTo_Host);

    const err = this.sdk.EdsSetPropertyData(
      this.cameraRef,
      C.kEdsPropID_SaveTo,
      0,
      4,
      saveTo
    );

    if (err !== C.EDS_ERR_OK) {
      cameraLogger.warn(
        `SessionManager: Failed to set save target: ${C.edsErrorToString(err)}`
      );
    } else {
      cameraLogger.debug("SessionManager: Save target set to host");

      // Set capacity for host mode
      const capacity = {
        numberOfFreeClusters: 0x7fffffff,
        bytesPerSector: 0x1000,
        reset: 1,
      };

      const capErr = this.sdk.EdsSetCapacity(this.cameraRef, capacity);
      if (capErr !== C.EDS_ERR_OK) {
        cameraLogger.warn(
          `SessionManager: Failed to set capacity: ${C.edsErrorToString(capErr)}`
        );
      }
    }
  }

  /**
   * Set up event handlers
   */
  private setupEventHandlers(): void {
    if (!this.sdk || !this.cameraRef) return;

    const koffi = require("koffi");
    const {
      EdsObjectEventHandler,
      EdsPropertyEventHandler,
      EdsStateEventHandler,
    } = require("../bindings/edsdk-bindings");

    // Object event handler
    this.objectEventHandler = (event: number, ref: any, _context: any): number => {
      if (this.onObjectEvent) {
        try {
          this.onObjectEvent(event, ref);
        } catch (error) {
          cameraLogger.error("SessionManager: Object event handler error", { error });
        }
      }
      return C.EDS_ERR_OK;
    };

    this.registeredObjectHandler = koffi.register(
      this.objectEventHandler,
      koffi.pointer(EdsObjectEventHandler)
    );

    this.sdk.EdsSetObjectEventHandler(
      this.cameraRef,
      C.kEdsObjectEvent_All,
      this.registeredObjectHandler,
      null
    );

    // Property event handler
    this.propertyEventHandler = (
      event: number,
      propertyId: number,
      param: number,
      _context: any
    ): number => {
      if (this.onPropertyEvent) {
        try {
          this.onPropertyEvent(propertyId, param);
        } catch (error) {
          cameraLogger.error("SessionManager: Property event handler error", { error });
        }
      }
      return C.EDS_ERR_OK;
    };

    this.registeredPropertyHandler = koffi.register(
      this.propertyEventHandler,
      koffi.pointer(EdsPropertyEventHandler)
    );

    this.sdk.EdsSetPropertyEventHandler(
      this.cameraRef,
      C.kEdsPropertyEvent_All,
      this.registeredPropertyHandler,
      null
    );

    // State event handler
    this.stateEventHandler = (event: number, param: number, _context: any): number => {
      if (this.onStateEvent) {
        try {
          this.onStateEvent(event, param);
        } catch (error) {
          cameraLogger.error("SessionManager: State event handler error", { error });
        }
      }
      return C.EDS_ERR_OK;
    };

    this.registeredStateHandler = koffi.register(
      this.stateEventHandler,
      koffi.pointer(EdsStateEventHandler)
    );

    this.sdk.EdsSetStateEventHandler(
      this.cameraRef,
      C.kEdsStateEvent_All,
      this.registeredStateHandler,
      null
    );

    cameraLogger.info("SessionManager: Event handlers registered");
  }

  /**
   * Track an object for cleanup
   */
  private trackObject(ref: any, type: string): void {
    if (!ref) return;
    this.trackedObjects.set(ref, {
      ref,
      type,
      createdAt: Date.now(),
    });
  }

  /**
   * Clean up all resources
   */
  private async cleanup(): Promise<void> {
    cameraLogger.debug("SessionManager: Starting cleanup");

    // Release all tracked objects (in reverse order of creation)
    const objects = Array.from(this.trackedObjects.values()).reverse();
    for (const obj of objects) {
      try {
        this.sdk?.EdsRelease(obj.ref);
        cameraLogger.debug(`SessionManager: Released ${obj.type}`);
      } catch (error) {
        cameraLogger.debug(`SessionManager: Error releasing ${obj.type}: ${error}`);
      }
    }
    this.trackedObjects.clear();

    // Close session
    if (this.isSessionOpen && this.cameraRef && this.sdk) {
      try {
        this.sdk.EdsCloseSession(this.cameraRef);
        cameraLogger.debug("SessionManager: Session closed");
      } catch (error) {
        cameraLogger.debug(`SessionManager: Error closing session: ${error}`);
      }
      this.isSessionOpen = false;
    }

    // Terminate SDK
    if (this.isInitialized && this.sdk) {
      try {
        this.sdk.EdsTerminateSDK();
        cameraLogger.debug("SessionManager: SDK terminated");
      } catch (error) {
        cameraLogger.debug(`SessionManager: Error terminating SDK: ${error}`);
      }
      this.isInitialized = false;
    }

    // Unload library
    unloadEdsdkLibrary();
    this.sdk = null;
    this.cameraRef = null;
    this.cameraListRef = null;

    cameraLogger.debug("SessionManager: Cleanup complete");
  }
}

/**
 * Camera Service for Linux/Electron
 * Uses Electron IPC to communicate with gphoto2 backend
 */

import { devLog, devError } from "../utils/logger";

// Type definitions for camera operations
export interface CameraStatus {
  connected: boolean;
  capturing: boolean;
  liveViewActive: boolean;
  mockMode: boolean;
  model?: string;
  battery?: number;
  shotsAvailable?: number;
}

export interface CaptureResult {
  success: boolean;
  photoNumber: number;
  photoPath: string;
  timestamp: string;
  mock?: boolean;
  attempts?: number;
}

// Check if running in Electron
const isElectron = (): boolean => {
  return (
    typeof window !== "undefined" &&
    typeof (window as any).electronAPI !== "undefined"
  );
};

// Get Electron API
const getElectronAPI = () => {
  if (!isElectron()) {
    throw new Error("Not running in Electron environment");
  }
  return (window as any).electronAPI;
};

export const cameraService = {
  /**
   * Check if camera is available (running in Electron)
   */
  isAvailable: (): boolean => {
    return isElectron();
  },

  /**
   * Get camera status
   */
  getStatus: async (): Promise<CameraStatus> => {
    try {
      if (!isElectron()) {
        return {
          connected: false,
          capturing: false,
          liveViewActive: false,
          mockMode: false,
        };
      }

      const api = getElectronAPI();
      const status = await api.camera.getStatus();
      devLog("Camera status:", status);
      return status;
    } catch (error) {
      devError("Failed to get camera status:", error);
      throw error;
    }
  },

  /**
   * Start live view (preview)
   */
  startLiveView: async (): Promise<boolean> => {
    try {
      if (!isElectron()) {
        throw new Error("Camera not available in browser mode");
      }

      const api = getElectronAPI();
      const result = await api.camera.startLiveView();
      devLog("Live view started:", result);
      return result;
    } catch (error) {
      devError("Failed to start live view:", error);
      throw error;
    }
  },

  /**
   * Stop live view
   */
  stopLiveView: async (): Promise<boolean> => {
    try {
      if (!isElectron()) {
        return true;
      }

      const api = getElectronAPI();
      const result = await api.camera.stopLiveView();
      devLog("Live view stopped:", result);
      return result;
    } catch (error) {
      devError("Failed to stop live view:", error);
      throw error;
    }
  },

  /**
   * Capture a photo
   */
  capture: async (photoNumber: number = 1): Promise<CaptureResult> => {
    try {
      if (!isElectron()) {
        throw new Error("Camera capture not available in browser mode");
      }

      const api = getElectronAPI();
      devLog("Capturing photo", photoNumber);

      const result = await api.camera.capture(photoNumber);
      devLog("Photo captured:", result);
      return result;
    } catch (error) {
      devError("Failed to capture photo:", error);
      throw error;
    }
  },

  /**
   * Reconnect to camera
   */
  reconnect: async (): Promise<boolean> => {
    try {
      if (!isElectron()) {
        throw new Error("Camera not available");
      }

      const api = getElectronAPI();
      const result = await api.camera.reconnect();
      devLog("Camera reconnected:", result);
      return result;
    } catch (error) {
      devError("Failed to reconnect camera:", error);
      throw error;
    }
  },

  /**
   * Set camera property (ISO, aperture, etc.)
   */
  setProperty: async (
    property: string,
    value: number | string,
  ): Promise<boolean> => {
    try {
      if (!isElectron()) {
        throw new Error("Camera not available");
      }

      const api = getElectronAPI();
      const result = await api.camera.setProperty(property, value);
      devLog("Camera property set:", property, value);
      return result;
    } catch (error) {
      devError("Failed to set camera property:", error);
      throw error;
    }
  },

  /**
   * Get camera property
   */
  getProperty: async (property: string): Promise<number | string> => {
    try {
      if (!isElectron()) {
        throw new Error("Camera not available");
      }

      const api = getElectronAPI();
      const result = await api.camera.getProperty(property);
      devLog("Camera property:", property, result);
      return result;
    } catch (error) {
      devError("Failed to get camera property:", error);
      throw error;
    }
  },

  /**
   * Subscribe to camera events
   */
  onCameraEvent: (
    event: string,
    callback: (data: any) => void,
  ): (() => void) => {
    if (!isElectron()) {
      return () => {}; // No-op cleanup
    }

    const api = getElectronAPI();

    // Map event names to electron API methods
    const eventMap: { [key: string]: string } = {
      connected: "onConnected",
      disconnected: "onDisconnected",
      captureStart: "onCaptureStart",
      captureComplete: "onCaptureComplete",
      captureError: "onCaptureError",
      liveViewStarted: "onLiveViewStarted",
      liveViewStopped: "onLiveViewStopped",
      liveViewFrame: "onLiveViewFrame",
    };

    const methodName = eventMap[event];
    if (!methodName || !api.camera[methodName]) {
      devError("Unknown camera event:", event);
      return () => {};
    }

    // Subscribe to event
    api.camera[methodName]((eventData: any, data: any) => {
      // Handle both (event, data) and just (data) formats
      const payload = data !== undefined ? data : eventData;
      callback(payload);
    });

    // Return cleanup function
    return () => {
      if (api.camera.removeAllListeners) {
        api.camera.removeAllListeners(event);
      }
    };
  },
};

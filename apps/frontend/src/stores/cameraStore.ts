import { create } from "zustand";
import type { CameraStatusResponse } from "@photonic/types";

interface CameraState extends CameraStatusResponse {
  // Extended status from backend
  serialNumber: string | null;
  sdCard: {
    present: boolean;
    writeable: boolean;
    freeSpaceMB: number | null;
  };
  liveView: {
    active: boolean;
    fps: number;
    droppedFrames: number;
  };
  capture: {
    locked: boolean;
    captureCount: number;
    lastCaptureAt: string | null;
    lastError: string | null;
  };
  watchdog: {
    status: "healthy" | "reconnecting" | "failed";
    reconnectAttempts: number;
    lastReconnectAt: string | null;
  };
  sdk: {
    version: string;
    dllPath: string;
  };
}

interface CameraStoreState {
  camera: CameraState;
  wsConnected: boolean;
  lastUpdate: string | null;
  batteryWarningDismissed: boolean;

  // Actions
  setCameraStatus: (status: Partial<CameraState>) => void;
  updateFromWebSocket: (event: { type: string; data: any }) => void;
  setWsConnected: (connected: boolean) => void;
  dismissBatteryWarning: () => void;
  resetBatteryWarning: () => void;
}

const initialState: CameraState = {
  connected: false,
  model: "Unknown",
  battery: 100,
  storageAvailable: false,
  settings: {},
  serialNumber: null,
  sdCard: {
    present: false,
    writeable: false,
    freeSpaceMB: null,
  },
  liveView: {
    active: false,
    fps: 0,
    droppedFrames: 0,
  },
  capture: {
    locked: false,
    captureCount: 0,
    lastCaptureAt: null,
    lastError: null,
  },
  watchdog: {
    status: "healthy",
    reconnectAttempts: 0,
    lastReconnectAt: null,
  },
  sdk: {
    version: "unknown",
    dllPath: "unknown",
  },
};

export const useCameraStore = create<CameraStoreState>((set) => ({
  camera: initialState,
  wsConnected: false,
  lastUpdate: null,
  batteryWarningDismissed: false,

  setCameraStatus: (status) =>
    set((state) => {
      const newBattery = status.battery ?? state.camera.battery;
      // Auto-reset dismissal when battery improves above threshold (20%)
      const shouldResetDismissal =
        state.batteryWarningDismissed && newBattery > 20;

      return {
        camera: { ...state.camera, ...status },
        batteryWarningDismissed: shouldResetDismissal
          ? false
          : state.batteryWarningDismissed,
        lastUpdate: new Date().toISOString(),
      };
    }),

  updateFromWebSocket: (event) => {
    const { type, data } = event;

    switch (type) {
      case "camera:connected":
        set((state) => ({
          camera: {
            ...state.camera,
            connected: true,
            model: data.model || state.camera.model,
            battery: data.battery ?? state.camera.battery,
          },
          lastUpdate: new Date().toISOString(),
        }));
        break;

      case "camera:disconnected":
        set((state) => ({
          camera: {
            ...state.camera,
            connected: false,
          },
          lastUpdate: new Date().toISOString(),
        }));
        break;

      case "camera:ready":
        set((state) => ({
          camera: {
            ...state.camera,
            connected: true,
            ...data,
          },
          lastUpdate: new Date().toISOString(),
        }));
        break;

      case "camera:busy":
        set((state) => ({
          camera: {
            ...state.camera,
            capture: {
              ...state.camera.capture,
              locked: true,
            },
          },
          lastUpdate: new Date().toISOString(),
        }));
        break;

      case "camera:error":
        set((state) => ({
          camera: {
            ...state.camera,
            capture: {
              ...state.camera.capture,
              lastError: data.message || "Unknown error",
            },
          },
          lastUpdate: new Date().toISOString(),
        }));
        break;

      case "battery:low":
        set((state) => ({
          camera: {
            ...state.camera,
            battery: data.level ?? state.camera.battery,
          },
          // Don't reset batteryWarningDismissed here - let user control dismissal
          // The warning will show/hide based on level vs threshold in the component
          lastUpdate: new Date().toISOString(),
        }));
        break;

      case "capture:complete":
        set((state) => ({
          camera: {
            ...state.camera,
            capture: {
              ...state.camera.capture,
              locked: false,
              captureCount: state.camera.capture.captureCount + 1,
              lastCaptureAt: new Date().toISOString(),
            },
          },
          lastUpdate: new Date().toISOString(),
        }));
        break;

      case "capture:error":
        set((state) => ({
          camera: {
            ...state.camera,
            capture: {
              ...state.camera.capture,
              locked: false,
              lastError: data.error || "Capture failed",
            },
          },
          lastUpdate: new Date().toISOString(),
        }));
        break;

      case "camera:status":
        // Full status update
        set({
          camera: { ...initialState, ...data },
          lastUpdate: new Date().toISOString(),
        });
        break;
    }
  },

  setWsConnected: (connected) => set({ wsConnected: connected }),

  dismissBatteryWarning: () => set({ batteryWarningDismissed: true }),

  resetBatteryWarning: () => set({ batteryWarningDismissed: false }),
}));

export default useCameraStore;

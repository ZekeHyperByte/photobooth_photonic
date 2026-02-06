/**
 * Camera Hook for React
 * Provides easy camera integration for components
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  cameraService,
  CameraStatus,
  CaptureResult,
} from "../services/cameraService";
import { devLog, devError } from "../utils/logger";

interface UseCameraOptions {
  autoConnect?: boolean;
  onError?: (error: Error) => void;
}

interface UseCameraReturn {
  // Status
  status: CameraStatus | null;
  isAvailable: boolean;
  isLoading: boolean;
  error: Error | null;

  // Live view
  liveViewFrame: string | null; // base64 image
  isLiveViewActive: boolean;

  // Actions
  refreshStatus: () => Promise<void>;
  startLiveView: () => Promise<void>;
  stopLiveView: () => Promise<void>;
  capture: (photoNumber?: number) => Promise<CaptureResult>;
  reconnect: () => Promise<void>;
}

export const useCamera = (options: UseCameraOptions = {}): UseCameraReturn => {
  const { autoConnect = false, onError } = options;

  // State
  const [status, setStatus] = useState<CameraStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [liveViewFrame, setLiveViewFrame] = useState<string | null>(null);
  const [isLiveViewActive, setIsLiveViewActive] = useState(false);

  // Refs for cleanup
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Check availability
  const isAvailable = cameraService.isAvailable();

  // Refresh camera status
  const refreshStatus = useCallback(async () => {
    if (!isAvailable) return;

    try {
      setIsLoading(true);
      const newStatus = await cameraService.getStatus();
      setStatus(newStatus);
      setError(null);
      devLog("Camera status refreshed:", newStatus);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      devError("Failed to refresh camera status:", error);
      if (onError) onError(error);
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable, onError]);

  // Start live view
  const startLiveView = useCallback(async () => {
    if (!isAvailable) {
      throw new Error("Camera not available");
    }

    try {
      setIsLoading(true);
      await cameraService.startLiveView();
      setIsLiveViewActive(true);
      setError(null);
      devLog("Live view started");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      devError("Failed to start live view:", error);
      if (onError) onError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable, onError]);

  // Stop live view
  const stopLiveView = useCallback(async () => {
    if (!isAvailable) return;

    try {
      setIsLoading(true);
      await cameraService.stopLiveView();
      setIsLiveViewActive(false);
      setLiveViewFrame(null);
      devLog("Live view stopped");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      devError("Failed to stop live view:", error);
      // Don't set error state for stop failures
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable]);

  // Capture photo
  const capture = useCallback(
    async (photoNumber: number = 1): Promise<CaptureResult> => {
      if (!isAvailable) {
        throw new Error("Camera not available");
      }

      try {
        setIsLoading(true);

        // Stop live view before capture (if active)
        const wasLiveView = isLiveViewActive;
        if (wasLiveView) {
          await stopLiveView();
        }

        // Capture
        const result = await cameraService.capture(photoNumber);
        setError(null);
        devLog("Photo captured:", result);

        // Restart live view if it was active
        if (wasLiveView) {
          await startLiveView();
        }

        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        devError("Failed to capture photo:", error);
        if (onError) onError(error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [isAvailable, isLiveViewActive, startLiveView, stopLiveView, onError],
  );

  // Reconnect camera
  const reconnect = useCallback(async () => {
    if (!isAvailable) {
      throw new Error("Camera not available");
    }

    try {
      setIsLoading(true);
      await cameraService.reconnect();
      await refreshStatus();
      setError(null);
      devLog("Camera reconnected");
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);
      devError("Failed to reconnect camera:", error);
      if (onError) onError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [isAvailable, refreshStatus, onError]);

  // Subscribe to live view frames
  useEffect(() => {
    if (!isAvailable || !isLiveViewActive) return;

    // Subscribe to live view frames
    const cleanup = cameraService.onCameraEvent(
      "liveViewFrame",
      (base64Data: string) => {
        setLiveViewFrame(`data:image/jpeg;base64,${base64Data}`);
      },
    );

    unsubscribeRef.current = cleanup;

    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [isAvailable, isLiveViewActive]);

  // Subscribe to camera events
  useEffect(() => {
    if (!isAvailable) return;

    const cleanups: (() => void)[] = [];

    // Subscribe to status change events
    cleanups.push(
      cameraService.onCameraEvent("connected", () => {
        devLog("Camera connected event");
        refreshStatus();
      }),
    );

    cleanups.push(
      cameraService.onCameraEvent("disconnected", () => {
        devLog("Camera disconnected event");
        refreshStatus();
      }),
    );

    cleanups.push(
      cameraService.onCameraEvent("captureComplete", (data) => {
        devLog("Capture complete event:", data);
        refreshStatus();
      }),
    );

    return () => {
      cleanups.forEach((cleanup) => cleanup());
    };
  }, [isAvailable, refreshStatus]);

  // Auto-connect on mount
  useEffect(() => {
    if (autoConnect && isAvailable) {
      refreshStatus();
    }
  }, [autoConnect, isAvailable, refreshStatus]);

  return {
    // Status
    status,
    isAvailable,
    isLoading,
    error,

    // Live view
    liveViewFrame,
    isLiveViewActive,

    // Actions
    refreshStatus,
    startLiveView,
    stopLiveView,
    capture,
    reconnect,
  };
};

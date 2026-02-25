import { useState, useEffect, useRef, useCallback, memo } from "react";
import { env } from "../config/env";

interface DSLRPreviewProps {
  onReady?: () => void;
  onError?: (error: string) => void;
  mirrored?: boolean;
}

/**
 * Check if running in Electron context with secure contextBridge
 */
function isElectron(): boolean {
  return (
    typeof window !== "undefined" && (window as any).electronAPI !== undefined
  );
}

/**
 * DSLRPreview component - memoized to prevent unnecessary re-renders
 * Shows live preview stream from the DSLR camera via IPC (Electron) or HTTP (Browser)
 *
 * In Electron: Uses contextBridge API (window.electronAPI) for secure IPC
 * In Browser: Uses HTTP MJPEG stream from backend
 */
export const DSLRPreview = memo(function DSLRPreview({
  onReady,
  onError,
  mirrored = false,
}: DSLRPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [transport, setTransport] = useState<"ipc" | "http">("http");
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // Determine transport mode on mount
  useEffect(() => {
    const determineTransport = async () => {
      const electronContext = isElectron();
      const envTransport = env.liveViewTransport;

      if (electronContext && envTransport === "ipc") {
        // Verify IPC is available by checking transport mode
        try {
          const electronAPI = (window as any).electronAPI;
          const transportInfo = await electronAPI.liveView.getTransportMode();

          if (transportInfo.transport === "ipc") {
            setTransport("ipc");
            console.log("[DSLRPreview] Using IPC transport via contextBridge");
          } else {
            setTransport("http");
            console.log(
              "[DSLRPreview] IPC available but configured for HTTP transport",
            );
          }
        } catch (error) {
          console.warn(
            "[DSLRPreview] Failed to get transport mode, falling back to HTTP:",
            error,
          );
          setTransport("http");
        }
      } else {
        setTransport("http");
        console.log("[DSLRPreview] Using HTTP transport");
      }
    };

    determineTransport();
  }, []);

  // Handle IPC live view via secure contextBridge
  useEffect(() => {
    if (transport !== "ipc" || !isElectron()) return;

    let isActive = true;
    const electronAPI = (window as any).electronAPI;

    const startIPCStream = async () => {
      try {
        // Start live view on backend via IPC
        const result = await electronAPI.liveView.start();
        console.log("[DSLRPreview] Live view started:", result);

        if (!result.success) {
          throw new Error("Failed to start live view");
        }

        // Subscribe to frame updates via contextBridge
        const unsubscribe = electronAPI.liveView.onFrame(
          (base64Frame: string) => {
            if (!isActive) return;

            setCurrentFrame(`data:image/jpeg;base64,${base64Frame}`);
            setIsLoading(false);
            setHasError(false);
            onReady?.();
          },
        );

        unsubscribeRef.current = unsubscribe;

        // Set a timeout in case no frames arrive
        const frameTimeout = setTimeout(() => {
          if (isActive && isLoading) {
            console.error("[DSLRPreview] No frames received within timeout");
            setHasError(true);
            onError?.("No live view frames received from camera");
          }
        }, 10000);

        return () => clearTimeout(frameTimeout);
      } catch (error) {
        console.error("[DSLRPreview] Failed to start IPC stream:", error);
        setHasError(true);
        setIsLoading(false);
        onError?.(
          error instanceof Error ? error.message : "IPC live view error",
        );
      }
    };

    startIPCStream();

    return () => {
      isActive = false;

      // Clean up subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }

      // Stop live view on backend
      if (electronAPI?.liveView) {
        electronAPI.liveView.stop().catch((err: Error) => {
          console.error("[DSLRPreview] Error stopping live view:", err);
        });
      }
    };
  }, [transport, onReady, onError, isLoading]);

  // Handle HTTP live view (img element)
  const handleImageLoad = useCallback(() => {
    setIsLoading(false);
    setHasError(false);
    onReady?.();
  }, [onReady]);

  const handleImageError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
    onError?.("Failed to load DSLR preview stream");
  }, [onError]);

  // Render canvas for IPC frames
  useEffect(() => {
    if (transport !== "ipc" || !currentFrame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Only resize canvas if dimensions changed
      if (canvas.width !== img.width || canvas.height !== img.height) {
        canvas.width = img.width;
        canvas.height = img.height;
      }
      ctx.drawImage(img, 0, 0);
    };
    img.onerror = () => {
      console.error("[DSLRPreview] Failed to decode frame");
    };
    img.src = currentFrame;
  }, [currentFrame, transport]);

  return (
    <div
      className="dslr-preview-container"
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      {isLoading && !hasError && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
          }}
        >
          <div className="spinner">Loading DSLR preview ({transport})...</div>
        </div>
      )}

      {hasError && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            color: "#ff6b6b",
          }}
        >
          <p>Failed to load DSLR preview</p>
          <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>
            Make sure the camera is connected
          </p>
        </div>
      )}

      {transport === "http" ? (
        // HTTP Transport - MJPEG stream
        <img
          ref={imageRef}
          src={`http://localhost:4000/api/camera/preview`}
          alt="DSLR Preview"
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: mirrored ? "scaleX(-1)" : "none",
            display: isLoading || hasError ? "none" : "block",
          }}
          onLoad={handleImageLoad}
          onError={handleImageError}
        />
      ) : (
        // IPC Transport - Canvas rendering
        <canvas
          ref={canvasRef}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            transform: mirrored ? "scaleX(-1)" : "none",
            display: isLoading || hasError ? "none" : "block",
          }}
        />
      )}
    </div>
  );
});

export default DSLRPreview;

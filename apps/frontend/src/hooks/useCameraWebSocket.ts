import { useEffect, useRef, useCallback } from "react";
import useCameraStore from "../stores/cameraStore";

const WS_URL = "ws://localhost:4000/ws/camera";

/**
 * WebSocket reconnection backoff configuration
 */
const BACKOFF_CONFIG = {
  baseDelayMs: 1000, // Start with 1 second
  maxDelayMs: 30000, // Cap at 30 seconds
  multiplier: 2, // Double the delay each attempt
  jitterMs: 500, // ±500ms random jitter
  resetOnSuccess: true, // Reset to base delay on successful connection
};

/**
 * Calculate next reconnect delay with exponential backoff and jitter
 */
function calculateBackoffDelay(attemptNumber: number): number {
  // Calculate exponential delay: base * (multiplier ^ attempt)
  const exponentialDelay =
    BACKOFF_CONFIG.baseDelayMs *
    Math.pow(BACKOFF_CONFIG.multiplier, attemptNumber);

  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, BACKOFF_CONFIG.maxDelayMs);

  // Add random jitter (±jitterMs)
  const jitter = (Math.random() * 2 - 1) * BACKOFF_CONFIG.jitterMs;

  return Math.max(0, cappedDelay + jitter);
}

/**
 * WebSocket hook for camera events
 * Connects to backend and hydrates camera state from WebSocket events
 *
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Jitter to prevent thundering herd on server restart
 * - Resets backoff on successful connection
 * - Logs reconnection attempts for debugging
 */
export function useCameraWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const reconnectAttemptRef = useRef<number>(0);
  const isIntentionalCloseRef = useRef<boolean>(false);

  const { updateFromWebSocket, setWsConnected, wsConnected } = useCameraStore();

  const connect = useCallback(() => {
    // Prevent multiple concurrent connections
    if (wsRef.current?.readyState === WebSocket.CONNECTING) {
      console.log("[WebSocket] Already connecting, skipping...");
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      console.log("[WebSocket] Already connected, skipping...");
      return;
    }

    try {
      console.log(`[WebSocket] Connecting to ${WS_URL}...`);
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WebSocket] Connected successfully");
        setWsConnected(true);

        // Reset backoff on successful connection
        if (BACKOFF_CONFIG.resetOnSuccess) {
          const previousAttempt = reconnectAttemptRef.current;
          reconnectAttemptRef.current = 0;
          if (previousAttempt > 0) {
            console.log(
              `[WebSocket] Connection restored after ${previousAttempt} attempt(s)`,
            );
          }
        }

        // Subscribe to all camera events
        ws.send(
          JSON.stringify({
            action: "subscribe",
            events: [
              "camera:connected",
              "camera:disconnected",
              "camera:ready",
              "camera:busy",
              "camera:error",
              "battery:low",
              "capture:complete",
              "capture:error",
            ],
          }),
        );

        // Request current status
        ws.send(JSON.stringify({ action: "getStatus" }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Log connection events but not all data events to avoid spam
          if (data.type === "connection") {
            console.log("[WebSocket] Server message:", data.data);
          }

          updateFromWebSocket(data);
        } catch (error) {
          console.error("[WebSocket] Error parsing message:", error);
        }
      };

      ws.onclose = (event) => {
        console.log("[WebSocket] Disconnected", {
          code: event.code,
          reason: event.reason || "No reason provided",
          wasClean: event.wasClean,
        });

        setWsConnected(false);
        wsRef.current = null;

        // Don't reconnect if this was an intentional close
        if (isIntentionalCloseRef.current) {
          console.log("[WebSocket] Intentional close, not reconnecting");
          isIntentionalCloseRef.current = false;
          return;
        }

        // Calculate next reconnect delay with backoff
        const attemptNumber = reconnectAttemptRef.current;
        const nextDelay = calculateBackoffDelay(attemptNumber);

        reconnectAttemptRef.current = attemptNumber + 1;

        console.log(
          `[WebSocket] Reconnect attempt ${reconnectAttemptRef.current} scheduled in ${Math.round(nextDelay)}ms`,
        );

        reconnectTimeoutRef.current = setTimeout(() => {
          console.log(
            `[WebSocket] Executing reconnect attempt ${reconnectAttemptRef.current}...`,
          );
          connect();
        }, nextDelay);
      };

      ws.onerror = (error) => {
        console.error("[WebSocket] Connection error:", error);
        setWsConnected(false);
        // Don't close here - let onclose handle reconnection
      };
    } catch (error) {
      console.error("[WebSocket] Failed to create connection:", error);
      setWsConnected(false);

      // Schedule retry even on connection creation failure
      const nextDelay = calculateBackoffDelay(reconnectAttemptRef.current);
      reconnectAttemptRef.current++;

      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, nextDelay);
    }
  }, [updateFromWebSocket, setWsConnected]);

  const disconnect = useCallback(() => {
    // Mark as intentional close to prevent auto-reconnect
    isIntentionalCloseRef.current = true;

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close WebSocket if open
    if (wsRef.current) {
      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close(1000, "Client disconnecting");
      }
      wsRef.current = null;
    }

    // Reset state
    reconnectAttemptRef.current = 0;
    setWsConnected(false);
  }, [setWsConnected]);

  const reconnect = useCallback(() => {
    // Manual reconnect - reset attempt counter for immediate retry
    reconnectAttemptRef.current = 0;
    isIntentionalCloseRef.current = false;
    disconnect();
    connect();
  }, [disconnect, connect]);

  useEffect(() => {
    // Initial connection
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    connected: wsConnected,
    reconnect,
    disconnect,
    reconnectAttempts: reconnectAttemptRef.current,
  };
}

export default useCameraWebSocket;

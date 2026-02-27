import { useEffect, useRef } from "react";

/**
 * Hook to detect user inactivity and trigger a callback after a timeout.
 * Only triggers when timeoutMs is finite (not Infinity).
 * Automatically clears timer when timeoutMs changes to prevent race conditions.
 */
export const useInactivity = (timeoutMs: number, onTimeout: () => void) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Store callback in ref to prevent effect re-runs when callback changes
  const onTimeoutRef = useRef(onTimeout);

  // Update callback ref when it changes
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    // Clear any existing timer when timeoutMs changes
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // If timeoutMs is Infinity, don't set up any timer (disabled)
    if (!Number.isFinite(timeoutMs)) {
      return;
    }

    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        onTimeoutRef.current();
      }, timeoutMs);
    };

    // List of events to track user activity
    const events = [
      "mousedown",
      "mousemove",
      "keypress",
      "scroll",
      "touchstart",
      "click",
    ];

    // Reset timer on any activity
    events.forEach((event) => {
      document.addEventListener(event, resetTimer);
    });

    // Start the timer
    resetTimer();

    // Cleanup function
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [timeoutMs]); // Re-run when timeoutMs changes to properly handle enable/disable
};

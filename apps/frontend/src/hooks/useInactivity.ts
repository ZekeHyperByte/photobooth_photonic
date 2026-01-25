import { useEffect, useRef } from 'react';

/**
 * Hook to detect user inactivity and trigger a callback after a timeout.
 * Optimized to prevent event listener re-registration when callback changes.
 * Uses refs to store mutable values without causing re-renders or effect re-runs.
 */
export const useInactivity = (timeoutMs: number, onTimeout: () => void) => {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Store callback in ref to prevent effect re-runs when callback changes
  const onTimeoutRef = useRef(onTimeout);
  // Store timeoutMs in ref for the same reason
  const timeoutMsRef = useRef(timeoutMs);

  // Update refs when values change (no effect dependency needed)
  onTimeoutRef.current = onTimeout;
  timeoutMsRef.current = timeoutMs;

  useEffect(() => {
    const resetTimer = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        onTimeoutRef.current();
      }, timeoutMsRef.current);
    };

    // List of events to track user activity
    const events = [
      'mousedown',
      'mousemove',
      'keypress',
      'scroll',
      'touchstart',
      'click',
    ];

    // Reset timer on any activity
    events.forEach((event) => {
      document.addEventListener(event, resetTimer);
    });

    // Start the timer on mount
    resetTimer();

    // Cleanup on unmount - only runs once
    return () => {
      events.forEach((event) => {
        document.removeEventListener(event, resetTimer);
      });
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []); // Empty dependency array - listeners only set up once
};

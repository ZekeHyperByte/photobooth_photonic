import React, { useEffect, useState } from 'react';
import { useSessionStore } from '../stores/sessionStore';
import { useUIStore } from '../stores/uiStore';
import clsx from 'clsx';

export const SessionTimer: React.FC = () => {
  const { sessionTimer } = useSessionStore();
  const { showToast } = useUIStore();
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [hasShownExpiredToast, setHasShownExpiredToast] = useState(false);

  useEffect(() => {
    if (!sessionTimer.isActive) {
      setHasShownExpiredToast(false);
      return;
    }

    // Add defensive check for startTime with fallback to current time
    const startTime = sessionTimer.startTime ?? Date.now();

    // Update remaining time immediately
    const remaining = Math.max(0, sessionTimer.timeLimit - Math.floor((Date.now() - startTime) / 1000));
    setRemainingSeconds(remaining);

    // Update every second
    const interval = setInterval(() => {
      const remaining = Math.max(0, sessionTimer.timeLimit - Math.floor((Date.now() - startTime) / 1000));
      setRemainingSeconds(remaining);

      // Show toast when time expires (only once)
      if (remaining === 0 && !hasShownExpiredToast) {
        showToast({
          type: 'warning',
          message: 'Waktu sesi habis. Mohon segera selesaikan.',
        });
        setHasShownExpiredToast(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionTimer, showToast, hasShownExpiredToast]);

  // Don't render if timer is not active
  if (!sessionTimer.isActive) {
    return null;
  }

  // Format seconds to MM:SS
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  // Determine color based on remaining time
  const getTimerColor = () => {
    if (remainingSeconds > 120) {
      return 'bg-neo-lime'; // > 2 minutes: green
    } else if (remainingSeconds > 60) {
      return 'bg-neo-yellow'; // 1-2 minutes: yellow
    } else {
      return 'bg-neo-magenta'; // < 1 minute: red
    }
  };

  const shouldPulse = remainingSeconds <= 60;

  return (
    <div className="fixed bottom-5 left-5 z-40">
      <div
        className={clsx(
          'flex items-center gap-3 px-6 py-3 rounded-none border-4 border-black shadow-neo font-bold',
          getTimerColor(),
          shouldPulse && 'animate-pulse'
        )}
      >
        <svg
          className="w-6 h-6 text-black"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-2xl text-black font-mono">{timeString}</span>
      </div>
    </div>
  );
};

import React from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { Button } from '../components/ui/Button';
import { APP_CONFIG } from '@photonic/config';

/**
 * SessionNoticeScreen
 * Displays session time limit notice before starting the photo session
 */
const SessionNoticeScreen: React.FC = () => {
  const { setScreen } = useUIStore();
  const { startSessionTimer } = useSessionStore();

  const handleStart = () => {
    // Start the session timer with defensive fallback
    const timeLimitSeconds = APP_CONFIG?.SESSION_TIME_LIMIT_SECONDS ?? 300;
    startSessionTimer(timeLimitSeconds);
    // Navigate to frame selection
    setScreen('frame-selection');
  };

  const handleBack = () => {
    setScreen('code-entry');
  };

  // Add defensive fallback to prevent NaN
  const timeLimitSeconds = APP_CONFIG?.SESSION_TIME_LIMIT_SECONDS ?? 300;
  const timeLimitMinutes = Math.floor(timeLimitSeconds / 60);

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-neo-lime p-8">
      {/* Navigation Buttons - Fixed at top corners */}
      <div className="absolute top-8 left-8 z-10">
        <Button
          onClick={handleBack}
          variant="secondary"
          size="medium"
          className="shadow-neo active:shadow-none"
        >
          Kembali
        </Button>
      </div>
      <div className="absolute top-8 right-8 z-10">
        <Button
          onClick={handleStart}
          variant="success"
          size="large"
          className="shadow-neo-lg active:shadow-none text-xl px-8"
        >
          Mulai Sekarang
        </Button>
      </div>

      <div className="bg-neo-cream border-[3px] border-black shadow-neo-lg p-6 max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-block bg-black px-6 py-2 mb-4">
            <h1 className="text-3xl font-bold text-neo-lime">
              Siap Memulai Sesi Foto?
            </h1>
          </div>
        </div>

        {/* Time Limit Badge */}
        <div className="flex justify-center mb-6">
          <div className="bg-neo-yellow border-[3px] border-black shadow-neo px-6 py-3 inline-flex items-center gap-3">
            <svg
              className="w-8 h-8 text-black"
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
            <div className="text-center">
              <div className="text-xs font-bold text-black mb-1">
                BATAS WAKTU SESI
              </div>
              <div className="text-4xl font-bold text-black">
                {timeLimitMinutes} MENIT
              </div>
            </div>
          </div>
        </div>

        {/* Instructions List */}
        <div className="bg-white border-[3px] border-black p-4 mb-4">
          <h2 className="text-lg font-bold text-black mb-3 flex items-center gap-2">
            <svg
              className="w-5 h-5 text-black"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
            Panduan Sesi Foto:
          </h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-black mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span className="text-base text-black font-medium">
                Pilih frame favorit Anda
              </span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-black mt-0.5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              <span className="text-base text-black font-medium">
                Foto akan diambil secara otomatis
              </span>
            </li>
            <li className="flex items-start gap-2">
              <svg
                className="w-5 h-5 text-black mt-0.5 flex-shrink-0"
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
              <span className="text-base text-black font-medium">
                Pastikan Anda siap sebelum melanjutkan
              </span>
            </li>
          </ul>
        </div>

        {/* Important Notice */}
        <div className="bg-neo-cyan border-[3px] border-black p-3">
          <p className="text-sm text-black font-bold text-center">
            Timer akan dimulai setelah Anda klik tombol "Mulai Sekarang"
          </p>
        </div>
      </div>
    </div>
  );
};

export default SessionNoticeScreen;

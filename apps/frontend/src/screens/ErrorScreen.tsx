import React, { useEffect, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { usePhotoStore } from '../stores/photoStore';
import { useSessionStore } from '../stores/sessionStore';
import { Button } from '../components/ui/Button';

const ErrorScreen: React.FC = () => {
  const { error, resetToIdle } = useUIStore();
  const { resetPhotos } = usePhotoStore();
  const { resetSession } = useSessionStore();

  // Combined reset function
  const resetAllState = useCallback(() => {
    resetPhotos();
    resetSession();
    resetToIdle();
  }, [resetPhotos, resetSession, resetToIdle]);

  // Auto-reset to idle after 30 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      resetAllState();
    }, 30000);

    return () => clearTimeout(timer);
  }, [resetAllState]);

  const handleTryAgain = () => {
    resetAllState();
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-neo-magenta">
      <div className="w-full max-w-3xl text-center">
        {/* Error Icon */}
        <div className="mb-6">
          <div className="w-24 h-24 mx-auto bg-neo-yellow border-[3px] border-black shadow-neo-lg flex items-center justify-center">
            <span className="text-4xl font-bold text-black">!</span>
          </div>
        </div>

        {/* Error Message */}
        <div className="inline-block bg-black px-6 py-3 mb-4">
          <h1 className="text-4xl font-bold text-neo-magenta">
            Oops! Terjadi Kesalahan
          </h1>
        </div>

        <p className="text-2xl text-black font-bold mb-8">
          {error?.message || 'Terjadi kesalahan yang tidak terduga.'}
        </p>

        {/* Error Details */}
        {error && (
          <div className="bg-neo-cream border-[3px] border-black p-4 mb-6 shadow-neo">
            <p className="text-xl text-black font-bold">
              Jenis Error: {error.type}
            </p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-center gap-6 flex-wrap">
          <Button onClick={handleTryAgain} size="large" variant="primary">
            {error?.recoverable ? 'Coba Lagi' : 'Mulai Ulang'}
          </Button>

          <Button onClick={resetAllState} size="large" variant="secondary">
            Kembali ke Awal
          </Button>
        </div>

        {/* Auto-reset notice */}
        <div className="mt-8 inline-block bg-black px-6 py-3">
          <p className="text-lg text-neo-magenta font-bold">
            Akan kembali ke layar awal dalam 30 detik...
          </p>
        </div>
      </div>
    </div>
  );
};

export default ErrorScreen;

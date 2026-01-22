import React, { useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { usePhotoStore } from '../stores/photoStore';
import { NumPad } from '../components/ui/NumPad';
import { Button } from '../components/ui/Button';

/**
 * CodeVerificationScreen
 * Allows customer to enter 4-digit booth code to start session
 */
const CodeVerificationScreen: React.FC = () => {
  const [code, setCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState('');
  const { setScreen, showToast } = useUIStore();
  const { setSession } = useSessionStore();
  const { resetPhotos } = usePhotoStore();

  const handleCodeChange = (value: string) => {
    setCode(value);
    setError('');
  };

  const handleBack = () => {
    setScreen('payment-method');
  };

  const handleVerify = async () => {
    // Validate code format
    if (code.length !== 4) {
      setError('Kode harus 4 digit');
      return;
    }

    setIsVerifying(true);
    setError('');

    try {
      // Import services dynamically to avoid circular dependencies
      const { codeService } = await import('../services/codeService');
      const { sessionService } = await import('../services/sessionService');

      // Verify code (doesn't consume it)
      await codeService.verify(code);

      // Create session (consumes the code)
      const session = await sessionService.create({ code });
      setSession(session);

      // Clear photos from previous session
      resetPhotos();

      // Navigate to session notice screen
      setScreen('session-notice');
    } catch (err) {
      console.error('Code verification failed:', err);
      setError('Kode tidak valid atau sudah digunakan');

      if (showToast) {
        showToast({
          type: 'error',
          message: 'Kode tidak valid atau sudah digunakan. Silakan hubungi kasir.',
        });
      }
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen bg-neo-cyan p-8">
      {/* Back Button - Top Left */}
      <div className="absolute top-8 left-8 z-10">
        <Button
          onClick={handleBack}
          variant="secondary"
          size="medium"
          disabled={isVerifying}
          className="shadow-neo active:shadow-none"
        >
          Kembali
        </Button>
      </div>

      <div className="bg-neo-cream border-[3px] border-black shadow-neo-lg p-8 max-w-md w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-black px-6 py-2 mb-4">
            <h1 className="text-3xl font-bold text-neo-cyan">
              Selamat Datang!
            </h1>
          </div>
          <p className="text-black text-lg font-bold">
            Masukkan kode 4 digit dari kasir
          </p>
        </div>

        {/* Code Display */}
        <div className="mb-6">
          <div
            className={`w-full text-center text-5xl font-bold tracking-[0.75rem] border-[3px] rounded-none p-5 mb-4 bg-white ${
              error ? 'border-neo-magenta bg-pink-50' : 'border-black'
            }`}
          >
            {code.padEnd(4, '○').split('').map((char, i) => (
              <span key={i} className={char === '○' ? 'text-gray-300' : ''}>
                {char}
              </span>
            ))}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-neo-magenta border-[3px] border-black text-black px-4 py-3 text-center">
              <p className="font-bold">{error}</p>
            </div>
          )}
        </div>

        {/* NumPad */}
        <div className="mb-6">
          <NumPad
            value={code}
            onChange={handleCodeChange}
            maxLength={4}
            onSubmit={handleVerify}
            disabled={isVerifying}
          />
        </div>

        {/* Loading Indicator */}
        {isVerifying && (
          <div className="flex items-center justify-center gap-3 py-4">
            <span className="w-6 h-6 border-4 border-black border-t-transparent rounded-full animate-spin" />
            <span className="text-lg font-bold">Memverifikasi...</span>
          </div>
        )}

      </div>
    </div>
  );
};

export default CodeVerificationScreen;

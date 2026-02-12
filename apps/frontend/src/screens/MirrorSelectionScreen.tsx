import React, { useEffect, useState, useRef } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useSessionBackConfirm } from '../hooks/useSessionBackConfirm';
import { DSLRPreview } from '../components/DSLRPreview';
import { devLog, devError } from '../utils/logger';

/**
 * MirrorSelectionScreen
 * Allows customer to choose between mirrored (selfie-style) or non-mirrored camera preview
 * Shows two side-by-side camera previews with single shared MediaStream
 */
const MirrorSelectionScreen: React.FC = () => {
  const { setScreen } = useUIStore();
  const { setMirrorPreference } = useSessionStore();

  const [selection, setSelection] = useState<'mirrored' | 'non-mirrored' | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [cameraMode, setCameraMode] = useState<string>('webcam');

  const streamRef = useRef<MediaStream | null>(null);
  const videoLeftRef = useRef<HTMLVideoElement>(null);
  const videoRightRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);

  // Use confirmation dialog hook for back navigation
  const { handleBack, showConfirmDialog, handleConfirm, handleCancel } = useSessionBackConfirm('frame-selection');

  // Fetch camera mode on mount
  useEffect(() => {
    const fetchCameraMode = async () => {
      try {
        const response = await fetch('http://localhost:4000/api/camera/mode');
        const data = await response.json();
        if (data.success && data.data.mode) {
          setCameraMode(data.data.mode);
          devLog('[MirrorSelection] Camera mode:', data.data.mode);
        }
      } catch (err) {
        devError('[MirrorSelection] Failed to fetch camera mode:', err);
        // Default to webcam mode on error
        setCameraMode('webcam');
      }
    };

    fetchCameraMode();
  }, []);

  // Initialize camera stream (only for webcam mode)
  useEffect(() => {
    // Skip camera initialization if we haven't determined the mode yet
    if (!cameraMode) return;

    // For DSLR modes, we don't need to initialize webcam stream
    if (cameraMode === 'dslr') {
      devLog('[MirrorSelection] Using DSLR mode, skipping webcam initialization');
      setIsLoading(false);
      return;
    }

    // Reset mounted flag (important for React Strict Mode double-mount)
    mountedRef.current = true;

    const startCamera = async () => {
      try {
        devLog('[MirrorSelection] Starting webcam...');

        // Wait a frame for refs to be populated after render
        await new Promise(resolve => requestAnimationFrame(resolve));

        if (!videoLeftRef.current || !videoRightRef.current) {
          devError('[MirrorSelection] Video refs not available');
          if (mountedRef.current) {
            setError('Gagal memuat komponen video');
            setIsLoading(false);
          }
          return;
        }

        devLog('[MirrorSelection] Requesting camera access...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            facingMode: 'user',
          },
          audio: false,
        });

        devLog('[MirrorSelection] Got stream, active:', stream.active);

        if (!mountedRef.current) {
          devLog('[MirrorSelection] Component unmounted, stopping stream');
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;

        // Assign stream to both video elements
        videoLeftRef.current.srcObject = stream;
        videoRightRef.current.srcObject = stream;

        devLog('[MirrorSelection] Playing videos...');

        // Play both videos - catch individual errors
        try {
          await videoLeftRef.current.play();
          devLog('[MirrorSelection] Left video playing');
        } catch (playErr) {
          devError('[MirrorSelection] Left video play error:', playErr);
        }

        try {
          await videoRightRef.current.play();
          devLog('[MirrorSelection] Right video playing');
        } catch (playErr) {
          devError('[MirrorSelection] Right video play error:', playErr);
        }

        if (mountedRef.current) {
          devLog('[MirrorSelection] Camera ready!');
          setIsLoading(false);
        }
      } catch (err: any) {
        devError('[MirrorSelection] Camera error:', err);
        if (!mountedRef.current) return;

        let errorMessage = 'Gagal mengakses kamera';
        if (err.name === 'NotAllowedError') {
          errorMessage = 'Izin kamera ditolak. Mohon izinkan akses kamera.';
        } else if (err.name === 'NotFoundError') {
          errorMessage = 'Tidak ada kamera ditemukan di perangkat ini.';
        } else if (err.name === 'NotReadableError') {
          errorMessage = 'Kamera sedang digunakan oleh aplikasi lain.';
        }

        setError(errorMessage);
        setIsLoading(false);
      }
    };

    startCamera();

    return () => {
      devLog('[MirrorSelection] Cleanup - stopping stream');
      mountedRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [cameraMode]);

  const handleContinue = () => {
    if (!selection) return;

    setIsProcessing(true);
    setMirrorPreference(selection);
    setScreen('capture');
  };

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neo-yellow">
        <div className="bg-white border-[3px] border-black p-8 shadow-neo max-w-md text-center">
          <div className="text-6xl mb-4">📷</div>
          <h2 className="text-2xl font-bold text-black mb-4">Kesalahan Kamera</h2>
          <p className="text-lg text-black mb-6">{error}</p>
          <Button
            onClick={() => window.location.reload()}
            variant="success"
            size="large"
          >
            Coba Lagi
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col p-6 bg-neo-cyan">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button onClick={handleBack} variant="secondary" size="medium">
          Kembali
        </Button>
        <div className="inline-block bg-black px-6 py-3">
          <h1 className="text-2xl font-bold text-neo-cyan">Pilih Mode Kamera</h1>
        </div>
        <Button
          onClick={handleContinue}
          variant="success"
          size="medium"
          disabled={!selection || isProcessing}
          loading={isProcessing}
        >
          Lanjutkan
        </Button>
      </div>

      {/* Instruction Banner */}
      <div className="mb-6 bg-black border-[3px] border-neo-yellow px-4 py-3">
        <p className="text-neo-yellow text-lg font-bold text-center">
          Klik pada preview kamera yang Anda sukai
        </p>
      </div>

      {/* Main Content - Two Preview Panels (always render videos for refs to work) */}
      <div className="flex-1 flex gap-6 min-h-0 relative">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-neo-cyan">
            <div className="text-center">
              <span className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin inline-block mb-4" />
              <p className="text-xl font-bold text-black">Menginisialisasi kamera...</p>
            </div>
          </div>
        )}

        {/* Left Preview - Mirrored Mode */}
        <button
          onClick={() => setSelection('mirrored')}
          disabled={isProcessing || isLoading}
          className={`flex-1 flex flex-col border-[3px] overflow-hidden transition-all duration-200 ${
            selection === 'mirrored'
              ? 'border-neo-yellow shadow-neo-lg scale-[1.02]'
              : 'border-black shadow-neo hover:border-neo-magenta'
          } ${isProcessing || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {/* Video Preview */}
          <div className="flex-1 relative bg-gray-900 overflow-hidden">
            {cameraMode === 'webcam' ? (
              <video
                ref={videoLeftRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            ) : (
              <DSLRPreview mirrored={true} />
            )}
            {/* Selection Indicator */}
            {selection === 'mirrored' && (
              <div className="absolute top-4 right-4 w-8 h-8 bg-neo-yellow border-2 border-black flex items-center justify-center shadow-neo">
                <span className="text-lg font-bold">✓</span>
              </div>
            )}
          </div>

          {/* Label */}
          <div className="bg-black border-t-[3px] border-black p-4">
            <h2 className="text-xl font-bold text-neo-yellow mb-2">Mode Cermin</h2>
            <p className="text-sm text-neo-yellow">
              Seperti melihat di cermin (kiri-kanan terbalik)
            </p>
          </div>
        </button>

        {/* Right Preview - Non-Mirrored Mode */}
        <button
          onClick={() => setSelection('non-mirrored')}
          disabled={isProcessing || isLoading}
          className={`flex-1 flex flex-col border-[3px] overflow-hidden transition-all duration-200 ${
            selection === 'non-mirrored'
              ? 'border-neo-yellow shadow-neo-lg scale-[1.02]'
              : 'border-black shadow-neo hover:border-neo-magenta'
          } ${isProcessing || isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {/* Video Preview */}
          <div className="flex-1 relative bg-gray-900 overflow-hidden">
            {cameraMode === 'webcam' ? (
              <video
                ref={videoRightRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            ) : (
              <DSLRPreview mirrored={false} />
            )}
            {/* Selection Indicator */}
            {selection === 'non-mirrored' && (
              <div className="absolute top-4 right-4 w-8 h-8 bg-neo-yellow border-2 border-black flex items-center justify-center shadow-neo">
                <span className="text-lg font-bold">✓</span>
              </div>
            )}
          </div>

          {/* Label */}
          <div className="bg-black border-t-[3px] border-black p-4">
            <h2 className="text-xl font-bold text-neo-yellow mb-2">Mode Normal</h2>
            <p className="text-sm text-neo-yellow">
              Foto seperti yang dilihat orang lain
            </p>
          </div>
        </button>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Peringatan Sesi Aktif"
        message="Sesi sudah dimulai. Jika Anda kembali, token akan dianggap sudah digunakan dan Anda tidak dapat kembali lagi. Apakah Anda yakin?"
        confirmLabel="Ya, Kembali"
        cancelLabel="Batal"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default MirrorSelectionScreen;

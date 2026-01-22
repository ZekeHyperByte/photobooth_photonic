import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { usePhotoStore } from '../stores/photoStore';
import { useCountdown } from '../hooks/useCountdown';
import { photoService } from '../services/photoService';
import { APP_CONFIG } from '@photonic/config';
import { WebcamPreview, WebcamPreviewHandle } from '../components/WebcamPreview';

const CaptureScreen: React.FC = () => {
  const { setScreen, showToast, retakeMode, clearRetakeMode } = useUIStore();
  const { session } = useSessionStore();
  const { addPhoto, updatePhoto, photos } = usePhotoStore();
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [webcamReady, setWebcamReady] = useState(false);
  const webcamRef = useRef<WebcamPreviewHandle>(null);
  const isCapturingRef = useRef(false); // Ref for guard check to avoid stale closures

  // Timeout refs for cleanup
  const countdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const photoPreviewTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRetakeMode = retakeMode?.active ?? false;
  // Get photo count from session metadata (set during frame selection) or default to 3
  const photoCountFromSession = (session?.metadata as any)?.hardcodedConfig?.photoCount;
  const totalPhotos = isRetakeMode ? 1 : (photoCountFromSession || 3);
  const countdownSeconds = APP_CONFIG.CAPTURE_COUNTDOWN_SECONDS || 3;

  // Helper to clear all timeouts
  const clearAllTimeouts = useCallback(() => {
    if (countdownTimeoutRef.current) {
      clearTimeout(countdownTimeoutRef.current);
      countdownTimeoutRef.current = null;
    }
    if (transitionTimeoutRef.current) {
      clearTimeout(transitionTimeoutRef.current);
      transitionTimeoutRef.current = null;
    }
    if (photoPreviewTimeoutRef.current) {
      clearTimeout(photoPreviewTimeoutRef.current);
      photoPreviewTimeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // Memoized callbacks to prevent WebcamPreview re-initialization
  const handleWebcamReady = useCallback(() => {
    setWebcamReady(true);
  }, []);

  const handleWebcamError = useCallback(
    (error: string) => {
      showToast({
        type: 'error',
        message: error,
      });
    },
    [showToast]
  );

  const { seconds, isActive, start, stop, reset } = useCountdown(countdownSeconds, async () => {
    // Countdown complete - capture photo
    await capturePhoto();
  });

  const capturePhoto = useCallback(async () => {
    if (!session || !webcamRef.current) return;

    // Guard: Check if already capturing (use ref to avoid stale closure)
    if (isCapturingRef.current) return;

    // Count existing raw photos in store (exclude composite photos with sequenceNumber 99)
    const rawPhotoCount = photos.filter(
      (p) => p.sequenceNumber >= 1 && p.sequenceNumber <= totalPhotos
    ).length;

    // In normal mode, don't capture if we already have all photos
    if (!isRetakeMode && rawPhotoCount >= totalPhotos) {
      console.log(`[CaptureScreen] Already have ${totalPhotos} photos, skipping capture`);
      return;
    }

    try {
      isCapturingRef.current = true;
      setIsCapturing(true);

      // Capture from browser webcam
      const imageBlob = await webcamRef.current.capture();

      if (!imageBlob) {
        throw new Error('Failed to capture from webcam');
      }

      // Show local preview immediately
      const localPreviewUrl = URL.createObjectURL(imageBlob);
      setCapturedPhoto(localPreviewUrl);

      // Upload to backend (pass retakePhotoId when in retake mode)
      const photo = await photoService.upload(
        session.id,
        imageBlob,
        isRetakeMode ? retakeMode?.photoId : undefined
      );

      // In retake mode, replace the existing photo; otherwise, add new
      if (isRetakeMode && retakeMode) {
        // Update the existing photo with new data but keep the original ID and sequence
        const existingPhoto = photos.find((p) => p.id === retakeMode.photoId);
        if (existingPhoto) {
          updatePhoto(retakeMode.photoId, {
            originalPath: photo.originalPath,
            processedPath: photo.processedPath,
            captureTime: photo.captureTime,
            processingStatus: photo.processingStatus,
            fileSize: photo.fileSize,
            width: photo.width,
            height: photo.height,
            metadata: photo.metadata,
          });
        }
      } else {
        addPhoto(photo);
      }

      // Wait 2 seconds before next photo or transition
      photoPreviewTimeoutRef.current = setTimeout(() => {
        URL.revokeObjectURL(localPreviewUrl);
        setCapturedPhoto(null);
        isCapturingRef.current = false;
        setIsCapturing(false);

        // Check if this was the last photo
        const nextIndex = currentPhotoIndex + 1;
        if (nextIndex >= totalPhotos) {
          // All photos captured - transition to photo review
          console.log('[CaptureScreen] Last photo captured, transitioning to photo-review');
          stop();
          if (isRetakeMode) {
            clearRetakeMode();
          }
          setScreen('photo-review');
        } else {
          // More photos to capture
          setCurrentPhotoIndex(nextIndex);
        }
      }, 2000);
    } catch (error) {
      console.error('Failed to capture photo:', error);
      showToast({
        type: 'error',
        message: 'Gagal mengambil foto. Mencoba lagi...',
      });

      // Retry after error
      retryTimeoutRef.current = setTimeout(() => {
        setCapturedPhoto(null);
        isCapturingRef.current = false;
        setIsCapturing(false);
        reset();
        start();
      }, 2000);
    }
  }, [session, addPhoto, updatePhoto, showToast, reset, start, isRetakeMode, retakeMode, photos, currentPhotoIndex, totalPhotos, stop, clearRetakeMode, setScreen]);

  // Effect for starting countdowns for each photo
  useEffect(() => {
    if (currentPhotoIndex < totalPhotos && webcamReady) {
      // Start countdown for next photo
      countdownTimeoutRef.current = setTimeout(() => {
        reset();
        start();
      }, 1000);
    }

    // Cleanup only countdown timeout
    return () => {
      if (countdownTimeoutRef.current) {
        clearTimeout(countdownTimeoutRef.current);
        countdownTimeoutRef.current = null;
      }
    };
  }, [currentPhotoIndex, webcamReady, reset, start, totalPhotos]);

  // Cleanup all timeouts on unmount
  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, [clearAllTimeouts]);

  // Determine visibility states for overlay pattern
  const showCountdown = webcamReady && isActive && !isCapturing;
  const showCapturedOverlay = capturedPhoto !== null;

  // Use bright white background during countdown to help with lighting
  const useWhiteBackground = webcamReady && (isActive || isCapturing) && !showCapturedOverlay;

  return (
    <div className={`w-full h-full flex flex-col items-center justify-center p-8 transition-colors duration-300 ${useWhiteBackground ? 'bg-white' : 'bg-black'}`}>
      <div className="w-full h-full flex flex-col items-center justify-center">
        {/* Camera Preview Area - Always render both layers */}
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="flex items-center w-full">
            {/* Left countdown - always in DOM, visibility controlled by opacity */}
            <div className="flex-1 flex items-center justify-center">
              <div
                className={`bg-neo-yellow text-black text-5xl font-bold px-6 py-3 border-[3px] border-black shadow-neo transition-opacity duration-200 ${
                  showCountdown ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {seconds || countdownSeconds}
              </div>
            </div>

            {/* Camera frame - always contains WebcamPreview, overlay on top */}
            <div className="relative w-full max-w-3xl aspect-video border-[3px] border-neo-yellow overflow-hidden">
              {/* WebcamPreview - always mounted, never unmounted during capture */}
              <WebcamPreview
                ref={webcamRef}
                onReady={handleWebcamReady}
                onError={handleWebcamError}
                className="w-full h-full"
              />

              {/* Captured photo overlay - absolute positioned on top of webcam */}
              <div
                className={`absolute inset-0 flex items-center justify-center bg-black transition-opacity duration-300 ${
                  showCapturedOverlay ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
              >
                {capturedPhoto && (
                  <div className="relative w-full h-full">
                    <img
                      src={capturedPhoto}
                      alt="Captured"
                      className="w-full h-full object-cover animate-scale-in"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-neo-lime text-black text-4xl font-bold px-12 py-6 border-4 border-black shadow-neo animate-scale-in">
                        {isRetakeMode
                          ? `Foto ${(retakeMode?.photoIndex ?? 0) + 1} Diperbarui!`
                          : `Foto ${currentPhotoIndex + 1} Berhasil!`}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right countdown - always in DOM, visibility controlled by opacity */}
            <div className="flex-1 flex items-center justify-center">
              <div
                className={`bg-neo-yellow text-black text-5xl font-bold px-6 py-3 border-[3px] border-black shadow-neo transition-opacity duration-200 ${
                  showCountdown ? 'opacity-100' : 'opacity-0'
                }`}
              >
                {seconds || countdownSeconds}
              </div>
            </div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full max-w-3xl mb-6">
          <div className="bg-neo-cream border-[3px] border-black p-4">
            {isRetakeMode ? (
              /* Retake mode - simplified display */
              <div className="flex items-center justify-center">
                <p className="text-2xl font-bold text-black">
                  Mengambil ulang Foto {(retakeMode?.photoIndex ?? 0) + 1}
                </p>
              </div>
            ) : (
              /* Normal mode - full progress bar */
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-2xl font-bold text-black">
                    Foto {currentPhotoIndex + 1} dari {totalPhotos}
                  </p>
                  <p className="text-xl text-black font-bold">
                    {Math.round(((currentPhotoIndex) / totalPhotos) * 100)}% selesai
                  </p>
                </div>
                <div className="w-full h-6 bg-white border-[3px] border-black">
                  <div
                    className="bg-neo-lime h-full transition-all duration-500"
                    style={{ width: `${(currentPhotoIndex / totalPhotos) * 100}%` }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CaptureScreen;

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useUIStore } from "../stores/uiStore";
import { useSessionStore } from "../stores/sessionStore";
import { usePhotoStore } from "../stores/photoStore";
import { useCountdown } from "../hooks/useCountdown";
import { photoService } from "../services/photoService";
import { APP_CONFIG } from "@photonic/config";
import { DSLRPreview } from "../components/DSLRPreview";
import { Spinner } from "../components/ui/Spinner";
import { devLog, devError } from "../utils/logger";

type CapturePhase = "warmup" | "countdown" | "capturing" | "result";

const CaptureScreen: React.FC = () => {
  const { setScreen, showToast, retakeMode, clearRetakeMode } = useUIStore();
  const { session, mirrorPreference } = useSessionStore();
  const { addPhoto, updatePhoto, photos } = usePhotoStore();

  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("warmup");
  const [captureKey, setCaptureKey] = useState(0);

  const isCapturingRef = useRef(false);
  const hasStartedFirstPhoto = useRef(false);

  const warmupSeconds = APP_CONFIG.CAPTURE_WARMUP_SECONDS || 4;
  const countdownSeconds = APP_CONFIG.CAPTURE_COUNTDOWN_SECONDS || 5;
  const resultDisplaySeconds = APP_CONFIG.CAPTURE_RESULT_DISPLAY_SECONDS || 4;

  const warmupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resultTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isRetakeMode = retakeMode?.active ?? false;
  const photoCountFromSession = (session?.metadata as any)?.hardcodedConfig
    ?.photoCount;
  const totalPhotos = isRetakeMode ? 1 : photoCountFromSession || 3;

  const clearAllTimeouts = useCallback(() => {
    if (warmupTimeoutRef.current) {
      clearTimeout(warmupTimeoutRef.current);
      warmupTimeoutRef.current = null;
    }
    if (resultTimeoutRef.current) {
      clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  const handlePreviewReady = useCallback(() => {
    devLog("[CaptureScreen] Preview ready");
    setPreviewReady(true);
  }, []);

  const handlePreviewError = useCallback(
    (error: string) => {
      showToast({ type: "error", message: error });
    },
    [showToast],
  );

  const { seconds, isActive, start, stop, reset } = useCountdown(
    countdownSeconds,
    async () => {
      devLog("[CaptureScreen] Countdown reached 0, calling capturePhoto");
      await capturePhoto();
    },
  );

  const startCountdown = useCallback(() => {
    devLog(
      "[CaptureScreen] Starting countdown for photo",
      currentPhotoIndex + 1,
    );
    setCapturePhase("countdown");
    reset();
    start();
  }, [reset, start, currentPhotoIndex]);

  const startWarmup = useCallback(() => {
    devLog("[CaptureScreen] Starting warmup phase");
    setCapturePhase("warmup");

    warmupTimeoutRef.current = setTimeout(() => {
      devLog("[CaptureScreen] Warmup time complete");
    }, warmupSeconds * 1000);
  }, [warmupSeconds]);

  const showResult = useCallback(
    (photoUrl: string, isLastPhoto: boolean) => {
      devLog("[CaptureScreen] Showing result, starting camera reconnection");
      setCapturedPhoto(photoUrl);
      setCapturePhase("result");

      // CRITICAL: Start camera reconnection immediately while result is showing
      // This happens in the background while user sees their photo
      setCaptureKey((prev) => {
        devLog(
          "[CaptureScreen] Incrementing captureKey for camera reconnection:",
          prev + 1,
        );
        return prev + 1;
      });
      // Reset preview ready - will become true when camera reconnects
      setPreviewReady(false);

      resultTimeoutRef.current = setTimeout(() => {
        devLog("[CaptureScreen] Result display complete");
        setCapturedPhoto(null);

        if (isLastPhoto) {
          devLog("[CaptureScreen] Last photo, transitioning to review");
          stop();
          if (isRetakeMode) {
            clearRetakeMode();
          }
          setScreen("photo-review");
        } else {
          devLog(`[CaptureScreen] Starting photo ${currentPhotoIndex + 2}`);
          isCapturingRef.current = false;
          setIsCapturing(false);
          setCurrentPhotoIndex((prev) => prev + 1);
        }
      }, resultDisplaySeconds * 1000);
    },
    [
      resultDisplaySeconds,
      isRetakeMode,
      clearRetakeMode,
      setScreen,
      stop,
      currentPhotoIndex,
    ],
  );

  const capturePhoto = useCallback(async () => {
    devLog("[CaptureScreen] capturePhoto called");

    if (!session) {
      devLog("[CaptureScreen] No session, returning");
      return;
    }

    if (isCapturingRef.current) {
      devLog("[CaptureScreen] Already capturing, returning");
      return;
    }

    const rawPhotoCount = photos.filter(
      (p) => p.sequenceNumber >= 1 && p.sequenceNumber <= totalPhotos,
    ).length;

    if (!isRetakeMode && rawPhotoCount >= totalPhotos) {
      devLog(
        `[CaptureScreen] Already have ${totalPhotos} photos, skipping capture`,
      );
      return;
    }

    try {
      isCapturingRef.current = true;
      setIsCapturing(true);
      setCapturePhase("capturing");

      devLog("[CaptureScreen] Capturing photo", currentPhotoIndex + 1);
      const sequenceNumber = isRetakeMode
        ? (retakeMode?.photoIndex ?? 0) + 1
        : currentPhotoIndex + 1;

      const photo = await photoService.capture(
        session.id,
        sequenceNumber,
        isRetakeMode ? retakeMode?.photoId : undefined,
      );

      if (isRetakeMode && retakeMode) {
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

      const isLastPhoto = isRetakeMode
        ? true
        : currentPhotoIndex + 1 >= totalPhotos;

      showResult(photo.originalPath, isLastPhoto);
    } catch (error: any) {
      devError("Failed to capture photo:", error);

      // Check if this is an autofocus failure
      const errorType = error?.response?.data?.error_type || error?.error_type;
      const isAFFailure =
        errorType === "AUTOFOCUS_FAILED" ||
        error?.message?.toLowerCase().includes("focus") ||
        error?.response?.data?.error?.toLowerCase().includes("focus");

      if (isAFFailure) {
        devLog("[CaptureScreen] Autofocus failure detected, recovering...");

        // Show AF failure message
        showToast({
          type: "warning",
          message: "Kamera gagal fokus. Mencoba ulang...",
        });

        // Force live view remount to reconnect camera
        setCaptureKey((prev) => {
          devLog(
            "[CaptureScreen] Remounting DSLRPreview for AF recovery:",
            prev + 1,
          );
          return prev + 1;
        });

        // Reset preview ready state
        setPreviewReady(false);

        // Clear capture state
        isCapturingRef.current = false;
        setIsCapturing(false);

        // Wait 3 seconds for camera to reconnect, then restart countdown
        retryTimeoutRef.current = setTimeout(() => {
          devLog("[CaptureScreen] AF recovery complete, restarting countdown");
          setCapturePhase("countdown");
          reset();
          start();
        }, 3000);
      } else {
        // Other errors - show generic message and retry
        showToast({
          type: "error",
          message: "Gagal mengambil foto. Mencoba lagi...",
        });

        retryTimeoutRef.current = setTimeout(() => {
          setCapturedPhoto(null);
          isCapturingRef.current = false;
          setIsCapturing(false);
          setCapturePhase("countdown");
          reset();
          start();
        }, 2000);
      }
    }
  }, [
    session,
    photos,
    totalPhotos,
    isRetakeMode,
    retakeMode,
    currentPhotoIndex,
    addPhoto,
    updatePhoto,
    showToast,
    reset,
    start,
    showResult,
  ]);

  // Effect to start first photo sequence or retake
  useEffect(() => {
    if (hasStartedFirstPhoto.current) return;
    hasStartedFirstPhoto.current = true;

    // Always use warmup - both for first sequence and retake
    startWarmup();
  }, [isRetakeMode, startCountdown, startWarmup]);

  // Effect: Start countdown when preview becomes ready (first photo only)
  useEffect(() => {
    if (previewReady && capturePhase === "warmup") {
      devLog("[CaptureScreen] Preview ready after warmup, starting countdown");
      startCountdown();
    }
  }, [previewReady, capturePhase, startCountdown]);

  // Effect to handle subsequent photos - start countdown when preview is ready
  useEffect(() => {
    if (
      currentPhotoIndex > 0 &&
      previewReady &&
      capturePhase !== "countdown" &&
      capturePhase !== "capturing"
    ) {
      devLog(
        "[CaptureScreen] Preview ready after result, starting countdown for photo",
        currentPhotoIndex + 1,
      );
      startCountdown();
    }
  }, [currentPhotoIndex, previewReady, capturePhase, startCountdown]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearAllTimeouts();
  }, [clearAllTimeouts]);

  // Determine UI states
  const showWarmupOverlay = capturePhase === "warmup";
  const showCountdownOverlay =
    capturePhase === "countdown" && isActive && !isCapturing;
  const showFullscreenResult =
    (capturePhase === "result" || capturePhase === "capturing") &&
    capturedPhoto;

  // Use white background during countdown for lighting
  const useWhiteBackground =
    capturePhase === "countdown" || capturePhase === "capturing";

  return (
    <div
      className={`w-full h-full flex flex-col items-center justify-center p-8 transition-colors duration-300 ${useWhiteBackground ? "bg-white" : "bg-black"}`}
    >
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div className="flex-1 flex items-center justify-center w-full">
          <div className="flex items-center w-full">
            {/* Left countdown */}
            <div className="flex-1 flex items-center justify-center">
              <div
                className={`bg-neo-yellow text-black text-5xl font-bold px-6 py-3 border-[3px] border-black shadow-neo transition-opacity duration-200 ${
                  showCountdownOverlay ? "opacity-100" : "opacity-0"
                }`}
              >
                {seconds || countdownSeconds}
              </div>
            </div>

            {/* Camera frame */}
            <div className="relative w-full max-w-3xl aspect-video border-[3px] border-neo-yellow overflow-hidden">
              {/* DSLRPreview - remounts with captureKey to reconnect */}
              <DSLRPreview
                key={captureKey}
                onReady={handlePreviewReady}
                onError={handlePreviewError}
                mirrored={mirrorPreference !== "non-mirrored"}
              />

              {/* Warmup overlay - covers preview during warmup */}
              <div
                className={`absolute inset-0 bg-neo-yellow flex flex-col items-center justify-center z-10 transition-opacity duration-300 ${
                  showWarmupOverlay
                    ? "opacity-100"
                    : "opacity-0 pointer-events-none"
                }`}
              >
                <Spinner size="large" className="mb-4" />
                <p className="text-black text-2xl font-bold">
                  Mempersiapkan kamera...
                </p>
              </div>
            </div>

            {/* Right countdown */}
            <div className="flex-1 flex items-center justify-center">
              <div
                className={`bg-neo-yellow text-black text-5xl font-bold px-6 py-3 border-[3px] border-black shadow-neo transition-opacity duration-200 ${
                  showCountdownOverlay ? "opacity-100" : "opacity-0"
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
              <div className="flex items-center justify-center">
                <p className="text-2xl font-bold text-black">
                  Mengambil ulang Foto {(retakeMode?.photoIndex ?? 0) + 1}
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-2xl font-bold text-black">
                    Foto {currentPhotoIndex + 1} dari {totalPhotos}
                  </p>
                  <p className="text-xl text-black font-bold">
                    {Math.round((currentPhotoIndex / totalPhotos) * 100)}%
                    selesai
                  </p>
                </div>
                <div className="w-full h-6 bg-white border-[3px] border-black">
                  <div
                    className="bg-neo-lime h-full transition-all duration-500"
                    style={{
                      width: `${(currentPhotoIndex / totalPhotos) * 100}%`,
                    }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* FULL SCREEN RESULT OVERLAY */}
      {showFullscreenResult && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center p-8">
          <div className="relative max-w-5xl max-h-[80vh] w-full h-full flex items-center justify-center">
            <img
              src={capturedPhoto}
              alt="Captured"
              className="max-w-full max-h-full object-contain animate-scale-in border-4 border-neo-yellow"
            />
          </div>
          <div className="mt-8 bg-neo-lime text-black text-5xl font-bold px-16 py-8 border-4 border-black shadow-neo-lg animate-scale-in">
            {isRetakeMode
              ? `Foto ${(retakeMode?.photoIndex ?? 0) + 1} Diperbarui!`
              : `Foto ${currentPhotoIndex + 1} Berhasil!`}
          </div>
        </div>
      )}
    </div>
  );
};

export default CaptureScreen;

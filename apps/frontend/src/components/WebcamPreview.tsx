import { useRef, useEffect, useState, useCallback, forwardRef, useImperativeHandle } from 'react';

export interface WebcamPreviewHandle {
  capture: () => Promise<Blob | null>;
}

interface WebcamPreviewProps {
  onReady?: () => void;
  onError?: (error: string) => void;
  className?: string;
}

export const WebcamPreview = forwardRef<WebcamPreviewHandle, WebcamPreviewProps>(
  ({ onReady, onError, className = '' }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Store callbacks in refs to avoid re-running useEffect when they change
    const onReadyRef = useRef(onReady);
    const onErrorRef = useRef(onError);

    // Keep refs up to date with latest callbacks
    useEffect(() => {
      onReadyRef.current = onReady;
      onErrorRef.current = onError;
    }, [onReady, onError]);

    // Start webcam stream - runs only once on mount
    useEffect(() => {
      let mounted = true;

      const startWebcam = async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              facingMode: 'user',
            },
            audio: false,
          });

          if (!mounted) {
            stream.getTracks().forEach(track => track.stop());
            return;
          }

          streamRef.current = stream;

          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setIsReady(true);
            onReadyRef.current?.();
          }
        } catch (err: any) {
          if (!mounted) return;

          let errorMessage = 'Failed to access camera';
          if (err.name === 'NotAllowedError') {
            errorMessage = 'Camera permission denied. Please allow camera access.';
          } else if (err.name === 'NotFoundError') {
            errorMessage = 'No camera found on this device.';
          } else if (err.name === 'NotReadableError') {
            errorMessage = 'Camera is already in use by another application.';
          }

          setError(errorMessage);
          onErrorRef.current?.(errorMessage);
        }
      };

      startWebcam();

      // Cleanup on unmount
      return () => {
        mounted = false;
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
      };
    }, []); // Empty dependency array - only run on mount

    // Capture method exposed via ref
    const capture = useCallback(async (): Promise<Blob | null> => {
      if (!videoRef.current || !canvasRef.current || !isReady) {
        return null;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');

      if (!ctx) return null;

      // Set canvas size to video size
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas (mirror horizontally for selfie view)
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0);

      // Convert to blob
      return new Promise((resolve) => {
        canvas.toBlob(
          (blob) => resolve(blob),
          'image/jpeg',
          0.85 // Good quality but smaller file size
        );
      });
    }, [isReady]);

    // Expose capture method to parent
    useImperativeHandle(ref, () => ({
      capture,
    }), [capture]);

    if (error) {
      return (
        <div className={`flex items-center justify-center bg-gray-800 ${className}`}>
          <div className="text-center text-white p-8">
            <div className="text-6xl mb-4">📷</div>
            <p className="text-xl text-red-400">{error}</p>
            <p className="text-sm text-gray-400 mt-2">
              Please check your browser settings and try again.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className={`relative overflow-hidden bg-gray-900 ${className}`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }} // Mirror for selfie view
        />
        <canvas ref={canvasRef} className="hidden" />
        {!isReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
            <div className="text-center text-white">
              <div className="animate-spin text-4xl mb-4">⏳</div>
              <p>Starting camera...</p>
            </div>
          </div>
        )}
      </div>
    );
  }
);

WebcamPreview.displayName = 'WebcamPreview';

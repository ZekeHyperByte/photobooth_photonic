import { useState, memo } from 'react';

interface DSLRPreviewProps {
  onReady?: () => void;
  onError?: (error: string) => void;
  mirrored?: boolean;
}

/**
 * DSLRPreview component - memoized to prevent unnecessary re-renders
 * Shows live preview stream from the DSLR camera via the backend proxy
 */
export const DSLRPreview = memo(function DSLRPreview({ onReady, onError, mirrored = false }: DSLRPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const handleLoad = () => {
    setIsLoading(false);
    setHasError(false);
    onReady?.();
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
    onError?.('Failed to load DSLR preview stream');
  };

  return (
    <div className="dslr-preview-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      {isLoading && !hasError && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}
        >
          <div className="spinner">Loading DSLR preview...</div>
        </div>
      )}

      {hasError && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#ff6b6b',
          }}
        >
          <p>Failed to load DSLR preview</p>
          <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
            Make sure DigiCamControl webserver is running
          </p>
        </div>
      )}

      <img
        src="http://localhost:4000/api/camera/preview"
        alt="DSLR Preview"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          transform: mirrored ? 'scaleX(-1)' : 'none',
          display: isLoading || hasError ? 'none' : 'block',
        }}
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  );
});

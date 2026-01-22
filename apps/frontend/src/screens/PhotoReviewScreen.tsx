import React, { useState, useMemo } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { usePhotoStore } from '../stores/photoStore';
import { Button } from '../components/ui/Button';

/**
 * Convert filesystem paths or relative paths to proper URLs
 */
const getPhotoUrl = (path: string | null): string | null => {
  if (!path) return null;

  // Already a full URL
  if (path.startsWith('http')) return path;

  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

  // Relative path starting with /data/
  if (path.startsWith('/data/')) {
    return `${apiUrl}${path}`;
  }

  // Absolute filesystem path - extract filename and determine directory
  const filename = path.split('/').pop();

  // Check for composite or processed images
  if (path.includes('/processed/') || filename?.startsWith('composite-')) {
    return `${apiUrl}/data/processed/${filename}`;
  }

  // Default to photos directory
  return `${apiUrl}/data/photos/${filename}`;
};

const PhotoReviewScreen: React.FC = () => {
  const { setScreen, startRetake } = useUIStore();
  const { session } = useSessionStore();
  const { photos, resetPhotos } = usePhotoStore();
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Get photo count from session metadata or default to 3
  const totalPhotoCount = useMemo(() => {
    const photoCountFromSession = (session?.metadata as any)?.hardcodedConfig?.photoCount;
    return photoCountFromSession || 3;
  }, [session]);

  // Debug logging
  console.log('[PhotoReviewScreen] All photos:', photos);
  console.log('[PhotoReviewScreen] Photo sequence numbers:', photos.map(p => ({ id: p.id, seq: p.sequenceNumber })));
  console.log('[PhotoReviewScreen] Expected photo count:', totalPhotoCount);

  // Filter to only show original capture photos and sort
  const capturedPhotos = photos
    .filter((p) => p.sequenceNumber >= 1 && p.sequenceNumber <= totalPhotoCount)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);

  console.log('[PhotoReviewScreen] Captured photos (filtered):', capturedPhotos);

  const selectedPhoto = capturedPhotos[selectedIndex];

  const handleThumbnailClick = (index: number) => {
    setSelectedIndex(index);
  };

  const handleRetake = (index: number) => {
    const photo = capturedPhotos[index];
    if (photo) {
      startRetake(index, photo.id);
    }
  };

  const handleBack = () => {
    // Go back to capture (full redo - clear photos)
    resetPhotos();
    setScreen('capture');
  };

  const handleContinue = () => {
    setScreen('filter-selection');
  };

  return (
    <div className="w-full h-full flex flex-col p-6 bg-neo-cream">
      {/* Navigation Buttons with Title - All at Top */}
      <div className="flex items-center justify-between mb-8">
        <Button onClick={handleBack} variant="danger" size="large">
          Kembali
        </Button>
        <div className="inline-block bg-black px-6 py-3">
          <h1 className="text-3xl font-bold text-neo-cream">Periksa Foto Anda</h1>
        </div>
        <Button
          onClick={handleContinue}
          variant="success"
          size="large"
          disabled={capturedPhotos.length < totalPhotoCount}
        >
          Lanjutkan
        </Button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col items-center min-h-0">
        {/* Large Preview Frame */}
        <div className="flex items-center justify-center w-full max-w-2xl mb-12">
          <div className="max-h-[45vh] border-[3px] border-black shadow-neo-lg bg-white p-2">
            {selectedPhoto ? (
              <img
                src={getPhotoUrl(selectedPhoto.originalPath) || ''}
                alt={`Foto ${selectedIndex + 1}`}
                className="max-h-[42vh] w-auto object-contain"
              />
            ) : (
              <div className="w-[400px] h-[300px] flex items-center justify-center text-black">
                <span className="text-2xl font-bold">Tidak ada foto</span>
              </div>
            )}
          </div>
        </div>

        {/* Thumbnails Row - Now at Bottom */}
        <div className="flex items-start justify-center gap-6 pb-4 mt-auto flex-wrap">
          {Array.from({ length: totalPhotoCount }, (_, index) => {
            const photo = capturedPhotos[index];
            const isSelected = selectedIndex === index;

            return (
              <div key={index} className="flex flex-col items-center gap-3">
                {/* Thumbnail */}
                <button
                  onClick={() => handleThumbnailClick(index)}
                  className={`relative w-28 h-20 border-[3px] bg-white overflow-hidden transition-all duration-200 ${
                    isSelected
                      ? 'border-neo-yellow shadow-neo-lg scale-105'
                      : 'border-black shadow-neo hover:border-neo-cyan'
                  }`}
                >
                  {photo ? (
                    <img
                      src={getPhotoUrl(photo.originalPath) || ''}
                      alt={`Thumbnail ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <span className="text-lg font-bold">{index + 1}</span>
                    </div>
                  )}
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 bg-neo-yellow border-2 border-black flex items-center justify-center">
                      <span className="text-xs font-bold">✓</span>
                    </div>
                  )}
                </button>

                {/* Photo number label */}
                <span className="text-sm font-bold text-black">Foto {index + 1}</span>

                {/* Retake button */}
                <Button
                  onClick={() => handleRetake(index)}
                  variant="secondary"
                  size="small"
                  disabled={!photo}
                  className="text-sm"
                >
                  Ulang
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PhotoReviewScreen;

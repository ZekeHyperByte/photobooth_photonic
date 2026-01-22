import React from 'react';
import { useUIStore } from '../stores/uiStore';
import { usePhotoStore } from '../stores/photoStore';
import { Button } from '../components/ui/Button';
import type { Photo } from '@photonic/types';

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

/**
 * Check if a photo is the composite (A3 collage)
 * Composite photos are marked with sequenceNumber 99
 */
const isCompositePhoto = (photo: Photo): boolean => {
  return photo.sequenceNumber === 99;
};

const PreviewScreen: React.FC = () => {
  const { setScreen } = useUIStore();
  const { photos } = usePhotoStore();

  // Filter to show only the composite photo (A3 collage)
  const compositePhoto = photos.find(isCompositePhoto);
  const displayPhotos = compositePhoto ? [compositePhoto] : photos;

  // Debug logging
  console.log('[PreviewScreen] Rendering with photos:', photos.map(p => ({
    id: p.id,
    sequenceNumber: p.sequenceNumber,
    hasOriginalPath: !!p.originalPath,
    hasProcessedPath: !!p.processedPath,
  })));
  console.log('[PreviewScreen] Composite photo found:', !!compositePhoto);
  console.log('[PreviewScreen] Displaying:', displayPhotos.length, 'photo(s)');

  // Enhanced debug logging for composite photo paths
  if (compositePhoto) {
    console.log('[PreviewScreen] Composite photo paths:', {
      originalPath: compositePhoto.originalPath,
      processedPath: compositePhoto.processedPath,
      resolvedProcessedUrl: getPhotoUrl(compositePhoto.processedPath),
      resolvedOriginalUrl: getPhotoUrl(compositePhoto.originalPath),
    });
  }

  const handleContinue = () => {
    setScreen('delivery');
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-neo-cream">
      {/* Compact Header */}
      <div className="text-center mb-4">
        <div className="inline-block bg-black px-5 py-2 mb-2">
          <h1 className="text-3xl font-bold text-neo-cream">Foto Anda Sudah Siap!</h1>
        </div>
      </div>

      {/* Height-Constrained Preview */}
      <div className="flex-1 flex items-center justify-center w-full max-h-[55vh] mb-4">
        {displayPhotos.map((photo) => (
          <div
            key={photo.id}
            className="h-full border-[3px] border-black shadow-neo-lg bg-white p-2"
          >
            {photo.processedPath || photo.originalPath ? (
              <img
                src={getPhotoUrl(photo.processedPath) || getPhotoUrl(photo.originalPath) || ''}
                alt="Hasil Foto Anda"
                className="h-full w-auto object-contain"
              />
            ) : (
              <div className="h-full aspect-[1/1.41] flex items-center justify-center text-black">
                <span className="text-4xl font-bold">FOTO</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Button */}
      <Button onClick={handleContinue} size="large" variant="success">
        Lanjutkan ke Pengiriman
      </Button>
    </div>
  );
};

export default PreviewScreen;

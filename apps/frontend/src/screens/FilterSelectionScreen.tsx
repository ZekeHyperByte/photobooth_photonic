import React, { useState, useEffect } from 'react';
import { useUIStore } from '../stores/uiStore';
import { usePhotoStore } from '../stores/photoStore';
import { photoService } from '../services/photoService';

/**
 * FilterSelectionScreen
 * Allows customer to select a filter after all photos are captured
 * Shows preview of first photo with each filter applied using real backend processing
 */
const FilterSelectionScreen: React.FC = () => {
  const [selectedFilterId, setSelectedFilterId] = useState<string | null>(null);
  const [filters, setFilters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterPreviews, setFilterPreviews] = useState<Record<string, string>>({});
  const [loadingPreviews, setLoadingPreviews] = useState(false);
  const { setScreen, showToast } = useUIStore();
  const { photos, selectFilter } = usePhotoStore();

  // Debug logging to track photos array
  useEffect(() => {
    console.log('[FilterSelectionScreen] Component mounted');
    console.log('[FilterSelectionScreen] Photos in store:', photos?.length || 0);
    console.log('[FilterSelectionScreen] Photos data:', photos);
  }, [photos]);

  useEffect(() => {
    console.log('[FilterSelectionScreen] Selected filter ID:', selectedFilterId);
  }, [selectedFilterId]);

  // Validate photos exist
  useEffect(() => {
    if (!photos || photos.length === 0) {
      console.error('[FilterSelectionScreen] No photos found in store!');
      showToast({
        type: 'error',
        message: 'Tidak ada foto ditemukan. Silakan ambil foto kembali.',
      });
      // Redirect back to capture screen
      setTimeout(() => setScreen('capture'), 2000);
    }
  }, [photos, showToast, setScreen]);

  useEffect(() => {
    loadFilters();
  }, []);

  // Generate real filter previews when filters and photos are loaded
  useEffect(() => {
    const generatePreviews = async () => {
      if (!photos || photos.length === 0 || filters.length === 0 || loadingPreviews) {
        return;
      }

      console.log('[FilterSelectionScreen] Generating filter previews...');
      setLoadingPreviews(true);

      try {
        const firstPhoto = photos[0];
        const previewUrls: Record<string, string> = {};

        // Generate preview for each filter (in parallel)
        // All filters (including 'none') use the backend endpoint for consistent CORS handling
        await Promise.all(
          filters.map(async (filter) => {
            try {
              const previewUrl = await photoService.generateFilterPreview(
                firstPhoto.id,
                filter.id  // 'none' or actual filter ID - backend handles both
              );
              previewUrls[filter.id] = previewUrl;
              console.log(`[FilterSelectionScreen] Preview generated for filter: ${filter.name}`);
            } catch (error) {
              console.error(`[FilterSelectionScreen] Failed to generate preview for filter ${filter.name}`, error);
              // On error, leave empty (will show placeholder)
              previewUrls[filter.id] = '';
            }
          })
        );

        setFilterPreviews(previewUrls);
        console.log('[FilterSelectionScreen] All previews generated successfully');
      } catch (error) {
        console.error('[FilterSelectionScreen] Preview generation error:', error);
        showToast({
          type: 'error',
          message: 'Gagal memuat preview filter',
        });
      } finally {
        setLoadingPreviews(false);
      }
    };

    generatePreviews();

    // Cleanup: revoke object URLs on unmount
    return () => {
      Object.values(filterPreviews).forEach(url => {
        if (url.startsWith('blob:')) {
          URL.revokeObjectURL(url);
        }
      });
    };
  }, [filters, photos]);

  const loadFilters = async () => {
    try {
      const { filterService } = await import('../services/filterService');
      const availableFilters = await filterService.getAll();

      // Find the Black & White filter (has grayscale config)
      const bwFilter = availableFilters.find(
        (f: any) =>
          f.filterConfig?.grayscale === true ||
          f.name.toLowerCase().includes('black') ||
          f.name.toLowerCase() === 'bw'
      );

      // Only show Normal (no filter) and Black & White options
      const filtersWithNone = [
        {
          id: 'none',
          name: 'Original',
          description: 'Tanpa filter',
          thumbnailPath: null,
          isActive: true,
        },
        ...(bwFilter
          ? [
              {
                ...bwFilter,
                name: 'Hitam Putih',
                description: 'Filter hitam putih klasik',
              },
            ]
          : []),
      ];

      setFilters(filtersWithNone);
      setIsLoading(false);

      // Auto-select "No Filter" by default
      setSelectedFilterId('none');
    } catch (error) {
      console.error('Failed to load filters:', error);
      if (showToast) {
        showToast({
          type: 'error',
          message: 'Gagal memuat filter',
        });
      }
      setIsLoading(false);
    }
  };

  const handleSelectFilter = (filterId: string) => {
    setSelectedFilterId(filterId);
  };

  const handleConfirm = () => {
    if (!selectedFilterId) return;

    // Find and save selected filter
    const filter = filters.find((f) => f.id === selectedFilterId);

    if (filter && filter.id !== 'none') {
      selectFilter(filter);
    } else {
      selectFilter(null); // No filter
    }

    // Move to processing screen
    setScreen('processing');
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neo-magenta">
        <div className="text-center">
          <div className="flex gap-2 justify-center mb-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-8 h-8 bg-black border-4 border-black animate-bounce"
                style={{
                  animationDelay: `${i * 0.15}s`,
                  animationDuration: '0.6s',
                }}
              />
            ))}
          </div>
          <p className="text-black text-xl font-bold">Memuat filter...</p>
        </div>
      </div>
    );
  }

  // Get first photo for preview (with null safety)
  const previewPhoto = photos && photos.length > 0 ? photos[0] : null;

  return (
    <div className="flex flex-col min-h-screen bg-neo-magenta p-8">
      {/* Header with Continue Button */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="inline-block bg-black px-6 py-3 mb-2">
            <h1 className="text-4xl font-bold text-neo-magenta">Pilih Filter</h1>
          </div>
          <p className="text-black text-lg font-bold">
            Pilih efek yang Anda inginkan
          </p>
        </div>
        <button
          onClick={handleConfirm}
          disabled={!selectedFilterId}
          className="bg-neo-yellow text-black text-xl font-bold px-10 py-4 border-[3px] border-black shadow-neo-lg hover:bg-yellow-300 disabled:bg-gray-400 disabled:cursor-not-allowed transition-all active:translate-x-[5px] active:translate-y-[5px] active:shadow-none disabled:active:translate-x-0 disabled:active:translate-y-0 disabled:active:shadow-neo-lg"
        >
          Lanjutkan
        </button>
      </div>

      {/* Filter Grid */}
      <div className="flex-1 flex items-center justify-center mb-8">
        <div className="grid grid-cols-2 gap-6 max-w-4xl w-full px-6">
          {filters.map((filter) => (
            <div
              key={filter.id}
              onClick={() => handleSelectFilter(filter.id)}
              className={`cursor-pointer border-[3px] border-black overflow-hidden transition-all ${
                selectedFilterId === filter.id
                  ? 'shadow-none translate-x-2 translate-y-2 ring-4 ring-neo-yellow'
                  : 'shadow-neo-lg hover:shadow-neo hover:translate-x-1 hover:translate-y-1'
              }`}
            >
              {/* Preview Image */}
              <div className="relative aspect-[4/3] bg-neo-cream">
                {loadingPreviews ? (
                  <div className="w-full h-full flex flex-col items-center justify-center">
                    <div className="flex gap-2 mb-2">
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          className="w-4 h-4 bg-black animate-bounce"
                          style={{
                            animationDelay: `${i * 0.15}s`,
                            animationDuration: '0.6s',
                          }}
                        />
                      ))}
                    </div>
                    <p className="text-black text-sm font-bold">Memuat preview...</p>
                  </div>
                ) : filterPreviews[filter.id] ? (
                  <img
                    src={filterPreviews[filter.id]}
                    alt={filter.name}
                    className="w-full h-full object-cover"
                  />
                ) : previewPhoto ? (
                  <img
                    src={
                      previewPhoto.originalPath.startsWith('http')
                        ? previewPhoto.originalPath
                        : `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}/data/photos/${previewPhoto.originalPath.split('/').pop()}`
                    }
                    alt={filter.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <p className="text-black font-bold">No Preview</p>
                  </div>
                )}

                {/* Selected Badge */}
                {selectedFilterId === filter.id && (
                  <div className="absolute top-3 right-3 bg-neo-yellow text-black px-3 py-1 border-[3px] border-black font-bold shadow-neo-sm text-sm">
                    Dipilih
                  </div>
                )}
              </div>

              {/* Filter Info */}
              <div className="bg-neo-cream border-t-[3px] border-black p-3">
                <h3 className="font-bold text-xl text-black mb-1">
                  {filter.name}
                </h3>
                <p className="text-sm text-black">{filter.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

export default FilterSelectionScreen;

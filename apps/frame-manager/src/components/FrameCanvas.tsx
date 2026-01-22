import React, { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { useFrameStore } from '../stores/frameStore';
import { useZonesStore } from '../stores/zonesStore';
import { PhotoZone } from './PhotoZone';

export const FrameCanvas: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { frameUrl, canvasWidth, canvasHeight } = useFrameStore();
  const [frameImage, imageStatus] = useImage(frameUrl || '');
  const { zones, selectedZoneId, selectZone } = useZonesStore();

  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });
  const [scale, setScale] = useState(1);

  // Calculate scale to fit canvas in container
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setContainerSize({ width, height });

        // Calculate scale to fit frame in container with padding
        const padding = 40;
        const scaleX = (width - padding) / canvasWidth;
        const scaleY = (height - padding) / canvasHeight;
        setScale(Math.min(scaleX, scaleY, 1));
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, [canvasWidth, canvasHeight]);

  const handleStageClick = (e: any) => {
    // Clicked on stage background - deselect all
    if (e.target === e.target.getStage()) {
      selectZone(null);
    }
  };

  const stageWidth = canvasWidth * scale;
  const stageHeight = canvasHeight * scale;

  // Center the stage in the container
  const offsetX = (containerSize.width - stageWidth) / 2;
  const offsetY = (containerSize.height - stageHeight) / 2;

  return (
    <div
      ref={containerRef}
      className="flex-1 bg-gray-200 border-[3px] border-black overflow-hidden relative"
      style={{ minHeight: '400px' }}
    >
      {!frameUrl ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-xl font-bold text-gray-500 mb-2">No Frame Loaded</p>
            <p className="text-gray-400">Upload a frame image to get started</p>
          </div>
        </div>
      ) : imageStatus === 'loading' ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-xl font-bold text-gray-500">Loading frame...</p>
          </div>
        </div>
      ) : imageStatus === 'failed' ? (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <p className="text-xl font-bold text-red-500 mb-2">Failed to load frame</p>
            <p className="text-gray-400">Please try uploading again</p>
          </div>
        </div>
      ) : (
        <div
          style={{
            position: 'absolute',
            left: offsetX,
            top: offsetY,
          }}
        >
          <Stage
            width={stageWidth}
            height={stageHeight}
            scaleX={scale}
            scaleY={scale}
            onClick={handleStageClick}
            onTap={handleStageClick}
          >
            <Layer>
              {/* Frame image as background */}
              <KonvaImage
                image={frameImage}
                width={canvasWidth}
                height={canvasHeight}
              />
            </Layer>
            <Layer>
              {/* Photo zones sorted by zIndex */}
              {[...zones]
                .sort((a, b) => a.zIndex - b.zIndex)
                .map((zone) => (
                  <PhotoZone
                    key={zone.id}
                    zone={zone}
                    index={zones.findIndex((z) => z.id === zone.id)}
                    isSelected={selectedZoneId === zone.id}
                    scale={scale}
                  />
                ))}
            </Layer>
          </Stage>
        </div>
      )}

      {/* Scale indicator */}
      <div className="absolute bottom-2 right-2 bg-black text-white px-2 py-1 text-sm font-bold">
        {Math.round(scale * 100)}%
      </div>
    </div>
  );
};

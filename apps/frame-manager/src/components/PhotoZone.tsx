import React, { useRef, useEffect } from 'react';
import { Rect, Transformer, Group, Text } from 'react-konva';
import Konva from 'konva';
import { PhotoZone as PhotoZoneType, useZonesStore } from '../stores/zonesStore';

interface PhotoZoneProps {
  zone: PhotoZoneType;
  index: number;
  isSelected: boolean;
  scale: number;
}

export const PhotoZone: React.FC<PhotoZoneProps> = ({
  zone,
  index,
  isSelected,
  scale,
}) => {
  const { updateZone, selectZone } = useZonesStore();
  const rectRef = useRef<Konva.Rect>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (isSelected && transformerRef.current && rectRef.current) {
      transformerRef.current.nodes([rectRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [isSelected]);

  const handleSelect = () => {
    selectZone(zone.id);
  };

  const handleDragEnd = (e: Konva.KonvaEventObject<DragEvent>) => {
    updateZone(zone.id, {
      x: Math.round(e.target.x()),
      y: Math.round(e.target.y()),
    });
  };

  const handleTransformEnd = () => {
    const node = rectRef.current;
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();

    // Reset scale and apply it to width/height
    node.scaleX(1);
    node.scaleY(1);

    updateZone(zone.id, {
      x: Math.round(node.x()),
      y: Math.round(node.y()),
      width: Math.round(Math.max(50, node.width() * scaleX)),
      height: Math.round(Math.max(50, node.height() * scaleY)),
      rotation: Math.round(node.rotation()),
    });
  };

  return (
    <Group>
      <Rect
        ref={rectRef}
        x={zone.x}
        y={zone.y}
        width={zone.width}
        height={zone.height}
        rotation={zone.rotation}
        fill="rgba(0, 212, 255, 0.3)"
        stroke={isSelected ? '#FFE135' : '#00D4FF'}
        strokeWidth={isSelected ? 4 / scale : 2 / scale}
        draggable
        onClick={handleSelect}
        onTap={handleSelect}
        onDragEnd={handleDragEnd}
        onTransformEnd={handleTransformEnd}
      />
      {/* Zone label */}
      <Text
        x={zone.x + 10}
        y={zone.y + 10}
        text={`Zone ${index + 1}`}
        fontSize={Math.max(14, 24 / scale)}
        fontStyle="bold"
        fill="#000"
        listening={false}
      />
      {isSelected && (
        <Transformer
          ref={transformerRef}
          boundBoxFunc={(oldBox, newBox) => {
            // Minimum size limit
            if (newBox.width < 50 || newBox.height < 50) {
              return oldBox;
            }
            return newBox;
          }}
          rotateEnabled={true}
          enabledAnchors={[
            'top-left',
            'top-right',
            'bottom-left',
            'bottom-right',
            'middle-left',
            'middle-right',
            'top-center',
            'bottom-center',
          ]}
        />
      )}
    </Group>
  );
};

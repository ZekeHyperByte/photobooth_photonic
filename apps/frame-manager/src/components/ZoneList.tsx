import React from 'react';
import { useZonesStore, PhotoZone } from '../stores/zonesStore';

export const ZoneList: React.FC = () => {
  const { zones, selectedZoneId, selectZone, removeZone, updateZone, addZone } =
    useZonesStore();

  const selectedZone = zones.find((z) => z.id === selectedZoneId);

  const handleInputChange = (field: keyof PhotoZone, value: string) => {
    if (!selectedZoneId) return;
    const numValue = parseInt(value, 10);
    if (isNaN(numValue)) return;
    updateZone(selectedZoneId, { [field]: numValue });
  };

  return (
    <div className="w-80 bg-neo-cream border-[3px] border-black p-4 flex flex-col gap-4 overflow-auto">
      <h2 className="text-lg font-bold text-black border-b-2 border-black pb-2">
        Photo Zones
      </h2>

      {/* Add Zone Button */}
      <button
        onClick={() => addZone()}
        className="w-full bg-neo-lime border-[3px] border-black px-4 py-2 font-bold text-black shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
      >
        + Add Photo Zone
      </button>

      {/* Zone List */}
      <div className="flex flex-col gap-2">
        {zones.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-4">
            No zones added yet. Click "Add Photo Zone" to create one.
          </p>
        ) : (
          zones.map((zone, index) => (
            <div
              key={zone.id}
              onClick={() => selectZone(zone.id)}
              className={`flex items-center justify-between p-3 border-[2px] cursor-pointer transition-all ${
                selectedZoneId === zone.id
                  ? 'bg-neo-yellow border-black'
                  : 'bg-white border-gray-300 hover:border-black'
              }`}
            >
              <span className="font-bold">Zone {index + 1}</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">
                  {zone.width}x{zone.height}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeZone(zone.id);
                  }}
                  className="text-red-500 hover:text-red-700 font-bold"
                >
                  X
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Selected Zone Details */}
      {selectedZone && (
        <div className="border-[3px] border-black p-4 bg-white">
          <h3 className="font-bold text-black mb-3">Zone Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-gray-600">X</label>
              <input
                type="number"
                value={selectedZone.x}
                onChange={(e) => handleInputChange('x', e.target.value)}
                className="w-full border-2 border-black px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600">Y</label>
              <input
                type="number"
                value={selectedZone.y}
                onChange={(e) => handleInputChange('y', e.target.value)}
                className="w-full border-2 border-black px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600">Width</label>
              <input
                type="number"
                value={selectedZone.width}
                onChange={(e) => handleInputChange('width', e.target.value)}
                className="w-full border-2 border-black px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-600">Height</label>
              <input
                type="number"
                value={selectedZone.height}
                onChange={(e) => handleInputChange('height', e.target.value)}
                className="w-full border-2 border-black px-2 py-1 text-sm"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold text-gray-600">Rotation</label>
              <input
                type="number"
                value={selectedZone.rotation}
                onChange={(e) => handleInputChange('rotation', e.target.value)}
                className="w-full border-2 border-black px-2 py-1 text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Info */}
      <div className="mt-auto text-xs text-gray-500">
        <p>
          <strong>Tip:</strong> Drag zones to position them. Use corner handles
          to resize, and edge handles to adjust width/height.
        </p>
      </div>
    </div>
  );
};

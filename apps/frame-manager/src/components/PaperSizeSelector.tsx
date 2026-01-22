import React from 'react';
import { getPaperSizeLabel } from '@photonic/config';
import { useFrameStore } from '../stores/frameStore';

export const PaperSizeSelector: React.FC = () => {
  const {
    paperSize,
    detectedPaperSize,
    canvasWidth,
    canvasHeight,
    setPaperSize,
  } = useFrameStore();

  const isCustomDetected = detectedPaperSize === 'CUSTOM';
  const hasOverride = paperSize !== detectedPaperSize;

  return (
    <div className="bg-white border-[3px] border-black p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-bold">Paper Size:</span>
        {detectedPaperSize && (
          <span className="text-sm bg-neo-cyan border-2 border-black px-2 py-1">
            Auto-detected: {getPaperSizeLabel(detectedPaperSize, canvasWidth, canvasHeight)}
          </span>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setPaperSize('A3')}
          className={`px-4 py-2 border-[3px] border-black font-bold transition-all ${
            paperSize === 'A3'
              ? 'bg-neo-yellow shadow-neo'
              : 'bg-white hover:bg-gray-100'
          }`}
        >
          A3 (297×420mm)
        </button>

        <button
          onClick={() => setPaperSize('A4')}
          className={`px-4 py-2 border-[3px] border-black font-bold transition-all ${
            paperSize === 'A4'
              ? 'bg-neo-yellow shadow-neo'
              : 'bg-white hover:bg-gray-100'
          }`}
        >
          A4 (210×297mm)
        </button>

        <button
          onClick={() => setPaperSize('CUSTOM')}
          className={`px-4 py-2 border-[3px] border-black font-bold transition-all ${
            paperSize === 'CUSTOM'
              ? 'bg-neo-yellow shadow-neo'
              : 'bg-white hover:bg-gray-100'
          }`}
        >
          Custom Size
        </button>
      </div>

      {hasOverride && (
        <div className="text-sm bg-neo-yellow border-2 border-black px-3 py-2">
          <strong>Note:</strong> You've overridden the auto-detected size.
          Custom sizes will print on A3 paper by default.
        </div>
      )}

      {isCustomDetected && (
        <div className="text-sm bg-blue-50 border-2 border-blue-400 px-3 py-2">
          <strong>Custom dimensions detected:</strong> {canvasWidth}×{canvasHeight}px.
          This frame will print on A3 paper.
        </div>
      )}
    </div>
  );
};

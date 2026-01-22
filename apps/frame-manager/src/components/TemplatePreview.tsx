import React, { useState, useEffect } from 'react';
import { Template, api } from '../services/api';

interface TemplatePreviewProps {
  template: Template | null;
  onClose: () => void;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  onClose,
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Reset state when template changes or is updated
  useEffect(() => {
    if (template) {
      setImageError(false);
      setIsLoading(true);
    }
  }, [template?.id, template?.updatedAt]);

  if (!template) return null;

  // Use updatedAt for cache-busting to get fresh preview after edits
  const previewUrl = api.getPreviewUrl(template.id, template.updatedAt);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />

      {/* Preview Container */}
      <div className="relative bg-neo-cream border-[4px] border-black shadow-neo-lg max-w-4xl max-h-[90vh] w-full mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b-[3px] border-black">
          <div>
            <h2 className="text-xl font-bold text-black">{template.name}</h2>
            {template.description && (
              <p className="text-sm text-gray-600 mt-1">{template.description}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 font-bold border-[3px] border-black bg-white hover:bg-gray-100 transition-colors"
          >
            Close
          </button>
        </div>

        {/* Preview Image */}
        <div className="flex-1 overflow-auto p-4 flex items-center justify-center bg-gray-100">
          {isLoading && !imageError && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-lg font-bold text-gray-500">Loading preview...</div>
            </div>
          )}

          {imageError ? (
            <div className="text-center">
              <p className="text-xl font-bold text-gray-500 mb-2">Preview not available</p>
              <p className="text-gray-400">The preview image could not be loaded</p>
            </div>
          ) : (
            <img
              src={previewUrl}
              alt={`Preview of ${template.name}`}
              className="max-w-full max-h-full object-contain border-[3px] border-black shadow-neo"
              onLoad={() => setIsLoading(false)}
              onError={() => {
                setIsLoading(false);
                setImageError(true);
              }}
              style={{ display: isLoading ? 'none' : 'block' }}
            />
          )}
        </div>

        {/* Info Footer */}
        <div className="flex items-center gap-4 p-3 border-t-[3px] border-black bg-white text-sm">
          <span className="font-bold">
            Size: {template.canvasWidth} x {template.canvasHeight}
          </span>
          <span>
            Photos: {template.photoCount || 0}
          </span>
          <span className={template.isActive ? 'text-green-600' : 'text-gray-500'}>
            {template.isActive ? 'Active' : 'Inactive'}
          </span>
        </div>
      </div>
    </div>
  );
};

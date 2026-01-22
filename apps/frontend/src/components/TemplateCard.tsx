import React, { useState } from 'react';
import type { Template } from '@photonic/types';
import { templateService } from '../services/templateService';

interface TemplateCardProps {
  template: Template;
  selected: boolean;
  onClick: () => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  selected,
  onClick,
}) => {
  const [imageError, setImageError] = useState(false);

  // Defensive check for template.id
  if (!template?.id) {
    console.error('TemplateCard: Invalid template - missing id', template);
    return null;
  }

  const previewUrl = templateService.getPreviewUrl(template.id);

  const handleImageError = () => {
    console.warn('TemplateCard: Failed to load preview for template:', template.id);
    setImageError(true);
  };

  return (
    <div
      className={`bg-white rounded-2xl shadow-lg overflow-hidden cursor-pointer transform transition-all duration-200 hover:scale-105 ${
        selected ? 'ring-4 ring-primary shadow-2xl' : ''
      }`}
      onClick={onClick}
    >
      {/* Preview Image */}
      <div className="relative aspect-[4/3] bg-gray-100">
        {imageError ? (
          <div className="w-full h-full flex items-center justify-center bg-gray-200">
            <span className="text-gray-500 text-sm">Preview tidak tersedia</span>
          </div>
        ) : (
          <img
            src={previewUrl}
            alt={template.name || 'Template'}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={handleImageError}
          />
        )}
        {selected && (
          <div className="absolute top-4 right-4 bg-primary text-white rounded-full w-12 h-12 flex items-center justify-center">
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        )}
      </div>

      {/* Template Name */}
      <div className="p-4 text-center">
        <h3 className="text-xl font-semibold text-gray-800 truncate">
          {template.name || 'Unnamed Template'}
        </h3>
        {template.description && (
          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
            {template.description}
          </p>
        )}
      </div>
    </div>
  );
};

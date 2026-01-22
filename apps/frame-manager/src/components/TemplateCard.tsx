import React, { useState, useMemo } from 'react';
import { Template, api } from '../services/api';

interface TemplateCardProps {
  template: Template;
  onEdit: (template: Template) => void;
  onDelete: (template: Template) => void;
  onToggleActive: (template: Template) => Promise<void>;
  onPreview: (template: Template) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({
  template,
  onEdit,
  onDelete,
  onToggleActive,
  onPreview,
}) => {
  const [thumbnailError, setThumbnailError] = useState(false);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  // Use photoCount from positionData or template
  const photoCount = template.positionData?.photoZones?.length ?? template.photoCount ?? 0;
  // Use updatedAt for cache-busting to get fresh thumbnail after edits
  const thumbnailUrl = useMemo(() => {
    return api.getThumbnailUrl(template.id, template.updatedAt);
  }, [template.id, template.updatedAt]);

  const handleToggleActive = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsTogglingActive(true);
    try {
      await onToggleActive(template);
    } catch {
      // Error is already handled in parent
    } finally {
      setIsTogglingActive(false);
    }
  };

  return (
    <div className="bg-white border-[3px] border-black shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all">
      {/* Thumbnail */}
      <div
        className="aspect-[3/4] bg-gray-200 border-b-[3px] border-black overflow-hidden cursor-pointer"
        onClick={() => onPreview(template)}
      >
        {thumbnailError ? (
          <div className="w-full h-full flex items-center justify-center text-gray-400">
            <span className="text-4xl">?</span>
          </div>
        ) : (
          <img
            src={thumbnailUrl}
            alt={template.name}
            className="w-full h-full object-cover"
            onError={() => setThumbnailError(true)}
          />
        )}
      </div>

      {/* Info */}
      <div className="p-3">
        <h3 className="font-bold text-black truncate" title={template.name}>
          {template.name || 'Untitled'}
        </h3>

        <div className="flex items-center gap-2 mt-2">
          {/* Status Badge */}
          <button
            onClick={handleToggleActive}
            disabled={isTogglingActive}
            className={`text-xs font-bold px-2 py-1 border-2 border-black transition-colors ${
              template.isActive
                ? 'bg-neo-lime text-black'
                : 'bg-gray-300 text-gray-600'
            } ${isTogglingActive ? 'opacity-50' : 'hover:opacity-80'}`}
            title={template.isActive ? 'Click to deactivate' : 'Click to activate'}
          >
            {isTogglingActive ? '...' : template.isActive ? 'Active' : 'Inactive'}
          </button>

          {/* Photo count */}
          <span className="text-xs text-gray-500">
            {photoCount} photo{photoCount !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onPreview(template)}
            className="flex-1 px-2 py-1 text-sm font-bold border-2 border-black bg-neo-cyan hover:bg-neo-cyan/80 transition-colors"
            title="Preview"
          >
            Preview
          </button>
          <button
            onClick={() => onEdit(template)}
            className="flex-1 px-2 py-1 text-sm font-bold border-2 border-black bg-neo-yellow hover:bg-neo-yellow/80 transition-colors"
            title="Edit"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(template)}
            className="px-2 py-1 text-sm font-bold border-2 border-black bg-red-400 hover:bg-red-500 text-white transition-colors"
            title="Delete"
          >
            X
          </button>
        </div>
      </div>
    </div>
  );
};

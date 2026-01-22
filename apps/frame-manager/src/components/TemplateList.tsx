import React, { useEffect, useState } from 'react';
import { useTemplateListStore } from '../stores/templateListStore';
import { useFrameStore } from '../stores/frameStore';
import { useZonesStore } from '../stores/zonesStore';
import { Template } from '../services/api';
import { TemplateCard } from './TemplateCard';
import { TemplatePreview } from './TemplatePreview';
import { ConfirmDialog } from './ConfirmDialog';

interface TemplateListProps {
  onSwitchToEditor: () => void;
}

export const TemplateList: React.FC<TemplateListProps> = ({ onSwitchToEditor }) => {
  const { templates, isLoading, error, fetchTemplates, deleteTemplate, toggleActive } =
    useTemplateListStore();
  const { loadTemplate, resetEditor } = useFrameStore();
  const { loadZones, clearZones } = useZonesStore();

  const [previewTemplate, setPreviewTemplate] = useState<Template | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Template | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  const handleEdit = (template: Template) => {
    loadTemplate(template);
    if (template.positionData?.photoZones) {
      loadZones(template.positionData.photoZones);
    } else {
      clearZones();
    }
    onSwitchToEditor();
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setIsDeleting(true);
    try {
      await deleteTemplate(deleteConfirm.id);
      setDeleteConfirm(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to delete template');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleToggleActive = async (template: Template): Promise<void> => {
    try {
      await toggleActive(template.id);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to update template');
      throw error;
    }
  };

  const handleNewTemplate = () => {
    resetEditor();
    clearZones();
    onSwitchToEditor();
  };

  if (isLoading && templates.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-xl font-bold text-gray-500">Loading templates...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-xl font-bold text-red-500">Error loading templates</p>
        <p className="text-gray-600">{error}</p>
        <button
          onClick={() => fetchTemplates()}
          className="px-6 py-2 font-bold border-[3px] border-black bg-neo-yellow shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 overflow-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-black">
          Templates ({templates.length})
        </h2>
        <button
          onClick={() => fetchTemplates()}
          className="px-4 py-2 font-bold border-[2px] border-black bg-white hover:bg-gray-100 transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Template Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
        {/* New Template Card */}
        <button
          onClick={handleNewTemplate}
          className="aspect-[3/4] bg-neo-cream border-[3px] border-dashed border-black flex flex-col items-center justify-center gap-4 hover:bg-neo-yellow/20 transition-colors"
        >
          <span className="text-5xl font-bold text-black">+</span>
          <span className="text-lg font-bold text-black">New Template</span>
        </button>

        {/* Existing Templates */}
        {templates.map((template) => (
          <TemplateCard
            key={template.id}
            template={template}
            onEdit={handleEdit}
            onDelete={(t) => setDeleteConfirm(t)}
            onToggleActive={handleToggleActive}
            onPreview={(t) => setPreviewTemplate(t)}
          />
        ))}
      </div>

      {/* Empty State */}
      {templates.length === 0 && (
        <div className="text-center py-12">
          <p className="text-xl font-bold text-gray-500 mb-4">No templates yet</p>
          <p className="text-gray-400 mb-6">
            Create your first template by clicking "New Template"
          </p>
        </div>
      )}

      {/* Preview Modal */}
      <TemplatePreview
        template={previewTemplate}
        onClose={() => setPreviewTemplate(null)}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteConfirm !== null}
        title="Delete Template"
        message={`Are you sure you want to delete "${deleteConfirm?.name || 'this template'}"? This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setDeleteConfirm(null)}
        isLoading={isDeleting}
      />
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { templateService } from '../services/templateService';
import { sessionService } from '../services/sessionService';
import { Button } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useSessionBackConfirm } from '../hooks/useSessionBackConfirm';
import type { Template } from '@photonic/types';

/**
 * FrameSelectionScreen
 * Allows customer to select a frame/template before capture
 * Shows available frames with photo count badges
 */
const FrameSelectionScreen: React.FC = () => {
  const { setScreen, showToast } = useUIStore();
  const { session, setSession, setSelectedTemplate } = useSessionStore();

  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSelecting, setIsSelecting] = useState(false);

  // Use confirmation dialog hook for back navigation
  const { handleBack, showConfirmDialog, handleConfirm, handleCancel } = useSessionBackConfirm('code-entry');

  // Fetch active templates on mount
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const data = await templateService.getActiveTemplates();
        setTemplates(data);

        // Auto-select first template if available
        if (data.length > 0) {
          setSelectedId(data[0].id);
        }
      } catch (error) {
        console.error('Failed to fetch templates:', error);
        showToast({
          type: 'error',
          message: 'Gagal memuat daftar frame',
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemplates();
  }, [showToast]);

  const handleSelect = (template: Template) => {
    setSelectedId(template.id);
  };

  const handleContinue = async () => {
    if (!selectedId || !session) return;

    const selectedTemplate = templates.find((t) => t.id === selectedId);
    if (!selectedTemplate) return;

    setIsSelecting(true);

    try {
      // Update session with selected template
      const updatedSession = await sessionService.selectTemplate(
        session.id,
        selectedId
      );

      // Update local state
      setSession(updatedSession);
      setSelectedTemplate(selectedTemplate);

      // Navigate to capture screen
      setScreen('capture');
    } catch (error) {
      console.error('Failed to select template:', error);
      showToast({
        type: 'error',
        message: 'Gagal memilih frame. Silakan coba lagi.',
      });
    } finally {
      setIsSelecting(false);
    }
  };

  const selectedTemplate = templates.find((t) => t.id === selectedId);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-neo-cyan">
        <div className="text-center">
          <span className="w-12 h-12 border-4 border-black border-t-transparent rounded-full animate-spin inline-block mb-4" />
          <p className="text-xl font-bold text-black">Memuat frame...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col p-6 bg-neo-cyan">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button onClick={handleBack} variant="secondary" size="medium">
          Kembali
        </Button>
        <div className="inline-block bg-black px-6 py-3">
          <h1 className="text-2xl font-bold text-neo-cyan">Pilih Frame</h1>
        </div>
        <Button
          onClick={handleContinue}
          variant="success"
          size="medium"
          disabled={!selectedId || isSelecting}
          loading={isSelecting}
        >
          Lanjutkan
        </Button>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex gap-6 min-h-0">
        {/* Frame Grid */}
        <div className="flex-1 overflow-auto">
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => {
              const isSelected = selectedId === template.id;
              const photoCount = template.photoCount || 3;

              return (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className={`relative bg-white border-[3px] p-2 transition-all duration-200 ${
                    isSelected
                      ? 'border-neo-yellow shadow-neo-lg scale-[1.02]'
                      : 'border-black shadow-neo hover:border-neo-magenta'
                  }`}
                >
                  {/* Thumbnail */}
                  <div className="aspect-[3/4] bg-gray-100 overflow-hidden mb-2">
                    <img
                      src={templateService.getThumbnailUrl(template.id, template.updatedAt)}
                      alt={template.name}
                      className="w-full h-full object-contain"
                      onError={(e) => {
                        // Fallback to placeholder if thumbnail fails
                        (e.target as HTMLImageElement).src =
                          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400"><rect fill="%23e5e7eb" width="300" height="400"/><text x="150" y="200" text-anchor="middle" fill="%239ca3af" font-size="20">No Preview</text></svg>';
                      }}
                    />
                  </div>

                  {/* Photo Count Badge */}
                  <div className="absolute top-3 right-3 bg-neo-lime border-2 border-black px-2 py-1 shadow-neo-sm">
                    <span className="text-sm font-bold text-black">
                      {photoCount} Foto
                    </span>
                  </div>

                  {/* Selection Indicator */}
                  {isSelected && (
                    <div className="absolute top-3 left-3 w-6 h-6 bg-neo-yellow border-2 border-black flex items-center justify-center">
                      <span className="text-sm font-bold">✓</span>
                    </div>
                  )}

                  {/* Name */}
                  <p className="text-sm font-bold text-black text-center truncate">
                    {template.name}
                  </p>
                </button>
              );
            })}
          </div>

          {templates.length === 0 && (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <p className="text-xl font-bold text-black mb-2">
                  Tidak ada frame tersedia
                </p>
                <p className="text-black">
                  Silakan hubungi operator untuk bantuan.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Preview Panel */}
        <div className="w-80 flex-shrink-0">
          <div className="bg-neo-cream border-[3px] border-black p-4 h-full">
            <h2 className="text-lg font-bold text-black mb-4 text-center">
              Preview
            </h2>

            {selectedTemplate ? (
              <div className="space-y-4">
                {/* Preview Image */}
                <div className="aspect-[3/4] bg-white border-[3px] border-black overflow-hidden">
                  <img
                    src={templateService.getPreviewUrl(selectedTemplate.id, selectedTemplate.updatedAt)}
                    alt={`Preview ${selectedTemplate.name}`}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      // Fallback to thumbnail if preview fails
                      (e.target as HTMLImageElement).src =
                        templateService.getThumbnailUrl(selectedTemplate.id, selectedTemplate.updatedAt);
                    }}
                  />
                </div>

                {/* Template Info */}
                <div className="space-y-2">
                  <h3 className="text-lg font-bold text-black">
                    {selectedTemplate.name}
                  </h3>
                  {selectedTemplate.description && (
                    <p className="text-sm text-gray-700">
                      {selectedTemplate.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="bg-neo-lime border-2 border-black px-3 py-1">
                      <span className="text-sm font-bold">
                        {selectedTemplate.photoCount || 3} Foto
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 text-center">
                  Pilih frame untuk melihat preview
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showConfirmDialog}
        title="Peringatan Sesi Aktif"
        message="Sesi sudah dimulai. Jika Anda kembali, token akan dianggap sudah digunakan dan Anda tidak dapat kembali lagi. Apakah Anda yakin?"
        confirmLabel="Ya, Kembali"
        cancelLabel="Batal"
        onConfirm={handleConfirm}
        onCancel={handleCancel}
      />
    </div>
  );
};

export default FrameSelectionScreen;

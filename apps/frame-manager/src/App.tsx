import React, { useState } from 'react';
import { FrameCanvas } from './components/FrameCanvas';
import { FrameUploader } from './components/FrameUploader';
import { ZoneList } from './components/ZoneList';
import { TemplateList } from './components/TemplateList';
import { PaperSizeSelector } from './components/PaperSizeSelector';
import { useFrameStore } from './stores/frameStore';
import { useZonesStore } from './stores/zonesStore';
import { useTemplateListStore } from './stores/templateListStore';
import { api } from './services/api';

type Tab = 'templates' | 'editor';

const App: React.FC = () => {
  const {
    framePath,
    frameId,
    canvasWidth,
    canvasHeight,
    paperSize,
    frameUrl,
    isEditing,
    templateName,
    templateDescription,
    setTemplateName,
    setTemplateDescription,
  } = useFrameStore();
  const { zones } = useZonesStore();
  const { fetchTemplates } = useTemplateListStore();

  const [activeTab, setActiveTab] = useState<Tab>('templates');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSave = async () => {
    if (!framePath || !frameUrl || !frameId || zones.length === 0) {
      alert('Please upload a frame and add at least one photo zone');
      return;
    }

    if (!templateName.trim()) {
      alert('Please enter a template name');
      return;
    }

    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const positionData = {
        photoZones: zones.map((zone) => ({
          id: zone.id,
          x: zone.x,
          y: zone.y,
          width: zone.width,
          height: zone.height,
          rotation: zone.rotation,
          zIndex: zone.zIndex,
        })),
        canvasWidth,
        canvasHeight,
      };

      await api.updateTemplate(frameId, {
        name: templateName,
        description: templateDescription,
        positionData,
        ...(paperSize && { paperSize }),
        isActive: true,
      });

      // Refresh templates list to get updated data including regenerated preview
      await fetchTemplates();

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (error) {
      console.error('Failed to save template:', error);
      alert(error instanceof Error ? error.message : 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwitchToEditor = () => {
    setActiveTab('editor');
  };

  const handleBackToTemplates = () => {
    fetchTemplates();
    setActiveTab('templates');
  };

  return (
    <div className="min-h-screen bg-neo-cream flex flex-col">
      {/* Header */}
      <header className="bg-black text-white p-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-bold text-neo-cyan">Frame Manager</h1>
          <div className="text-sm text-gray-400">
            Photonic Photobooth System
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b-[3px] border-black">
        <div className="max-w-7xl mx-auto flex">
          <button
            onClick={handleBackToTemplates}
            className={`px-6 py-3 font-bold border-r-[3px] border-black transition-colors ${
              activeTab === 'templates'
                ? 'bg-neo-yellow text-black'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Templates
          </button>
          <button
            onClick={() => setActiveTab('editor')}
            className={`px-6 py-3 font-bold border-r-[3px] border-black transition-colors ${
              activeTab === 'editor'
                ? 'bg-neo-yellow text-black'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Editor
            {isEditing && (
              <span className="ml-2 text-xs bg-neo-cyan px-2 py-0.5 rounded">
                Editing
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      {activeTab === 'templates' ? (
        <TemplateList onSwitchToEditor={handleSwitchToEditor} />
      ) : (
        <main className="flex-1 flex flex-col p-4 gap-4 max-w-7xl mx-auto w-full">
          {/* Top Bar - Upload and Save */}
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={handleBackToTemplates}
              className="px-4 py-2 font-bold border-[3px] border-black bg-white hover:bg-gray-100 transition-colors"
            >
              Back to Templates
            </button>

            {!frameUrl && (
              <div className="w-64">
                <FrameUploader />
              </div>
            )}

            {frameUrl && (
              <>
                <div className="flex-1 flex items-center gap-4">
                  <input
                    type="text"
                    placeholder="Template Name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className="flex-1 max-w-xs border-[3px] border-black px-4 py-2 font-bold"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={templateDescription}
                    onChange={(e) => setTemplateDescription(e.target.value)}
                    className="flex-1 max-w-sm border-[3px] border-black px-4 py-2"
                  />
                </div>

                <button
                  onClick={handleSave}
                  disabled={isSaving || !templateName.trim() || zones.length === 0}
                  className={`px-6 py-2 font-bold border-[3px] border-black shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    saveSuccess
                      ? 'bg-neo-lime'
                      : 'bg-neo-yellow'
                  }`}
                >
                  {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : isEditing ? 'Update Template' : 'Save Template'}
                </button>
              </>
            )}
          </div>

          {/* Canvas Info Bar */}
          {frameUrl && (
            <>
              <div className="flex items-center gap-4 text-sm">
                <span className="bg-white border-2 border-black px-3 py-1">
                  <strong>Canvas:</strong> {canvasWidth} x {canvasHeight} px
                </span>
                <span className="bg-white border-2 border-black px-3 py-1">
                  <strong>Zones:</strong> {zones.length}
                </span>
                {isEditing && (
                  <span className="bg-neo-cyan border-2 border-black px-3 py-1">
                    <strong>Mode:</strong> Editing Existing Template
                  </span>
                )}
              </div>

              {/* Paper Size Selector */}
              <PaperSizeSelector />
            </>
          )}

          {/* Main Editor Area */}
          <div className="flex-1 flex gap-4 min-h-0">
            <FrameCanvas />
            <ZoneList />
          </div>

          {/* Instructions */}
          {!frameUrl && (
            <div className="bg-white border-[3px] border-black p-6 text-center">
              <h2 className="text-xl font-bold mb-4">How to Use the Frame Editor</h2>
              <ol className="text-left max-w-lg mx-auto space-y-2">
                <li><strong>1.</strong> Click "Upload Frame Image" to upload your frame template (PNG recommended)</li>
                <li><strong>2.</strong> Click "+ Add Photo Zone" to create areas where customer photos will appear</li>
                <li><strong>3.</strong> Drag and resize zones to position them correctly on the frame</li>
                <li><strong>4.</strong> Enter a template name and click "Save Template"</li>
              </ol>
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="bg-gray-100 border-t-[3px] border-black p-4 text-center text-sm text-gray-600">
        Frame Manager v0.1 - Part of Photonic Photobooth System
      </footer>
    </div>
  );
};

export default App;

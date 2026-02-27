import React, { useState, useEffect } from "react";
import { useUIStore } from "../stores/uiStore";
import { useSessionStore } from "../stores/sessionStore";
import { Button } from "../components/ui/Button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useSessionBackConfirm } from "../hooks/useSessionBackConfirm";
import { DSLRPreview } from "../components/DSLRPreview";
import { Spinner } from "../components/ui/Spinner";
import { devLog } from "../utils/logger";

/**
 * MirrorSelectionScreen
 * Allows customer to choose between mirrored (selfie-style) or non-mirrored camera preview
 */
const MirrorSelectionScreen: React.FC = () => {
  const { setScreen } = useUIStore();
  const { setMirrorPreference } = useSessionStore();

  const [selection, setSelection] = useState<
    "mirrored" | "non-mirrored" | null
  >(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Warmup states
  const [warmupComplete, setWarmupComplete] = useState(false);
  const [leftPreviewReady, setLeftPreviewReady] = useState(false);
  const [rightPreviewReady, setRightPreviewReady] = useState(false);
  const [showContent, setShowContent] = useState(false);

  // Use confirmation dialog hook for back navigation
  const { handleBack, showConfirmDialog, handleConfirm, handleCancel } =
    useSessionBackConfirm("frame-selection");

  // Warmup timer - 4 seconds
  useEffect(() => {
    devLog("[MirrorSelection] Starting 4-second warmup");
    const warmupTimer = setTimeout(() => {
      devLog("[MirrorSelection] Warmup complete");
      setWarmupComplete(true);
    }, 4000);

    return () => clearTimeout(warmupTimer);
  }, []);

  // Show content when warmup is done AND both previews are ready
  useEffect(() => {
    if (warmupComplete && leftPreviewReady && rightPreviewReady) {
      devLog("[MirrorSelection] Both previews ready, showing content");
      setShowContent(true);
    }
  }, [warmupComplete, leftPreviewReady, rightPreviewReady]);

  const handleLeftPreviewReady = () => {
    devLog("[MirrorSelection] Left preview (mirrored) ready");
    setLeftPreviewReady(true);
  };

  const handleRightPreviewReady = () => {
    devLog("[MirrorSelection] Right preview (non-mirrored) ready");
    setRightPreviewReady(true);
  };

  const handleContinue = () => {
    if (!selection) return;

    setIsProcessing(true);
    setMirrorPreference(selection);

    // Add small delay to allow camera cleanup before navigating
    setTimeout(() => {
      devLog("[MirrorSelection] Continuing to capture screen");
      setScreen("capture");
    }, 100);
  };

  return (
    <div className="w-full h-full flex flex-col p-6 bg-neo-cyan">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Button onClick={handleBack} variant="secondary" size="medium">
          Kembali
        </Button>
        <div className="inline-block bg-black px-6 py-3">
          <h1 className="text-2xl font-bold text-neo-cyan">
            Pilih Mode Kamera
          </h1>
        </div>
        <Button
          onClick={handleContinue}
          variant="success"
          size="medium"
          disabled={!selection || isProcessing}
          loading={isProcessing}
        >
          Lanjutkan
        </Button>
      </div>

      {/* Instruction Banner */}
      <div className="mb-6 bg-black border-[3px] border-neo-yellow px-4 py-3">
        <p className="text-neo-yellow text-lg font-bold text-center">
          Klik pada preview kamera yang Anda sukai
        </p>
      </div>

      {/* Main Content - Two Preview Panels */}
      <div
        className={`flex-1 flex gap-6 min-h-0 relative transition-opacity duration-500 ${showContent ? "opacity-100" : "opacity-0"}`}
      >
        {/* Left Preview - Mirrored Mode */}
        <button
          onClick={() => setSelection("mirrored")}
          disabled={isProcessing}
          className={`flex-1 flex flex-col border-[3px] overflow-hidden transition-all duration-200 ${
            selection === "mirrored"
              ? "border-neo-yellow shadow-neo-lg scale-[1.02]"
              : "border-black shadow-neo hover:border-neo-magenta"
          } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {/* Video Preview */}
          <div className="flex-1 relative bg-gray-900 overflow-hidden">
            <DSLRPreview mirrored={true} onReady={handleLeftPreviewReady} />
            {/* Selection Indicator */}
            {selection === "mirrored" && (
              <div className="absolute top-4 right-4 w-8 h-8 bg-neo-yellow border-2 border-black flex items-center justify-center shadow-neo">
                <span className="text-lg font-bold">✓</span>
              </div>
            )}
          </div>

          {/* Label */}
          <div className="bg-black border-t-[3px] border-black p-4">
            <h2 className="text-xl font-bold text-neo-yellow mb-2">
              Mode Cermin
            </h2>
            <p className="text-sm text-neo-yellow">
              Seperti melihat di cermin (kiri-kanan terbalik)
            </p>
          </div>
        </button>

        {/* Right Preview - Non-Mirrored Mode */}
        <button
          onClick={() => setSelection("non-mirrored")}
          disabled={isProcessing}
          className={`flex-1 flex flex-col border-[3px] overflow-hidden transition-all duration-200 ${
            selection === "non-mirrored"
              ? "border-neo-yellow shadow-neo-lg scale-[1.02]"
              : "border-black shadow-neo hover:border-neo-magenta"
          } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          {/* Video Preview */}
          <div className="flex-1 relative bg-gray-900 overflow-hidden">
            <DSLRPreview mirrored={false} onReady={handleRightPreviewReady} />
            {/* Selection Indicator */}
            {selection === "non-mirrored" && (
              <div className="absolute top-4 right-4 w-8 h-8 bg-neo-yellow border-2 border-black flex items-center justify-center shadow-neo">
                <span className="text-lg font-bold">✓</span>
              </div>
            )}
          </div>

          {/* Label */}
          <div className="bg-black border-t-[3px] border-black p-4">
            <h2 className="text-xl font-bold text-neo-yellow mb-2">
              Mode Normal
            </h2>
            <p className="text-sm text-neo-yellow">
              Foto seperti yang dilihat orang lain
            </p>
          </div>
        </button>
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

      {/* FULL-SCREEN WARMUP OVERLAY */}
      {!showContent && (
        <div className="fixed inset-0 bg-neo-cyan z-50 flex flex-col items-center justify-center">
          <Spinner size="large" className="mb-4" />
          <p className="text-black text-2xl font-bold">
            Mempersiapkan preview kamera...
          </p>
        </div>
      )}
    </div>
  );
};

export default MirrorSelectionScreen;

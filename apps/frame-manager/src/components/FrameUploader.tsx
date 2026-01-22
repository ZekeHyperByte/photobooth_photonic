import React, { useRef } from 'react';
import { useFrameStore } from '../stores/frameStore';
import { useZonesStore } from '../stores/zonesStore';
import { api } from '../services/api';

interface FrameUploaderProps {
  onUpload?: () => void;
}

export const FrameUploader: React.FC<FrameUploaderProps> = ({ onUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setFrame, setLoading, isLoading } = useFrameStore();
  const { clearZones } = useZonesStore();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG or JPEG)');
      return;
    }

    setLoading(true);

    try {
      // Upload to backend
      const result = await api.uploadFrame(file);

      // Create single blob URL for preview
      const blobUrl = URL.createObjectURL(file);

      // Load image to extract dimensions
      const img = new Image();
      img.onload = () => {
        setFrame(
          blobUrl,
          result.filePath,
          result.frameId,
          img.naturalWidth,
          img.naturalHeight,
          result.detectedPaperSize
        );
        clearZones(); // Clear existing zones when loading new frame
        setLoading(false);
        onUpload?.();
      };
      img.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        alert('Failed to load image');
        setLoading(false);
      };
      img.src = blobUrl;
    } catch (error) {
      console.error('Upload failed:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload frame');
      setLoading(false);
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={handleClick}
        disabled={isLoading}
        className="w-full bg-neo-cyan border-[3px] border-black px-4 py-3 font-bold text-black shadow-neo hover:translate-x-1 hover:translate-y-1 hover:shadow-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? 'Uploading...' : 'Upload Frame Image'}
      </button>
    </div>
  );
};

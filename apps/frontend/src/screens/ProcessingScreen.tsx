import React, { useEffect, useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { usePhotoStore } from '../stores/photoStore';
import { Spinner } from '../components/ui/Spinner';
import { photoService } from '../services/photoService';
import { deliveryService } from '../services/deliveryService';

const ProcessingScreen: React.FC = () => {
  const { setScreen, showToast } = useUIStore();
  const { session, updateSession } = useSessionStore();
  const { photos, selectedTemplate, selectedFilter, addPhoto } = usePhotoStore();
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('Memulai pemrosesan...');

  useEffect(() => {
    processPhotos();
  }, []);

  const processPhotos = async () => {
    try {
      if (!session) {
        throw new Error('Session not found');
      }

      // Get template ID from session metadata
      const templateId = session.metadata?.hardcodedConfig?.templateId;

      if (!templateId) {
        throw new Error('No template configured for this session');
      }

      console.log('[ProcessingScreen] Creating A3 composite:', {
        sessionId: session.id,
        templateId,
        filterId: selectedFilter?.id,
        photoCount: photos.length,
      });

      setStatusMessage('Menggabungkan foto dengan template...');
      setProgress(30);

      // Create A3 composite with all 3 photos
      const compositePhoto = await photoService.createA3Composite(
        session.id,
        templateId,
        selectedFilter?.id
      );

      console.log('[ProcessingScreen] A3 composite created:', compositePhoto);

      setStatusMessage('Menyempurnakan hasil...');
      setProgress(70);

      // Add composite photo to store
      addPhoto(compositePhoto);

      // Update session metadata with composite photo ID
      if (updateSession) {
        updateSession({
          metadata: {
            ...session.metadata,
            compositePhotoId: compositePhoto.id,
          },
        });
      }

      // Auto-print the composite
      setStatusMessage('Mencetak foto...');
      setProgress(85);

      try {
        await deliveryService.queuePrint(compositePhoto.id, 1);
      } catch (printError) {
        console.error('Auto-print failed:', printError);
      }

      setStatusMessage('Selesai!');
      setProgress(100);

      // Move to preview
      setTimeout(() => {
        setScreen('preview');
      }, 1000);
    } catch (error) {
      console.error('Failed to process photos:', error);
      showToast({
        type: 'error',
        message: 'Gagal memproses foto. Silakan coba lagi.',
      });

      // Go back to photo review on error
      setTimeout(() => {
        setScreen('photo-review');
      }, 3000);
    }
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-8 bg-neo-lime">
      <div className="w-full max-w-3xl text-center">
        {/* Processing Icon */}
        <div className="mb-8">
          <Spinner size="large" className="mx-auto" />
        </div>

        {/* Status Message */}
        <div className="inline-block bg-black px-6 py-3 mb-4">
          <h1 className="text-4xl font-bold text-neo-lime">
            Memproses Foto Anda
          </h1>
        </div>

        <p className="text-2xl text-black font-bold mb-8">
          {statusMessage}
        </p>

        {/* Progress Bar */}
        <div className="bg-neo-cream border-[3px] border-black p-6 mb-6 shadow-neo-lg">
          <div className="mb-4">
            <p className="text-2xl font-bold text-black">
              {Math.round(progress)}% Selesai
            </p>
          </div>
          <div className="w-full h-6 bg-white border-[3px] border-black">
            <div
              className="bg-neo-cyan h-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Processing Steps */}
        <div className="bg-black p-6">
          <p className="text-xl text-neo-lime font-bold">
            {selectedTemplate && 'Menerapkan template'}
            {selectedTemplate && selectedFilter && ' • '}
            {selectedFilter && 'Menerapkan filter'}
            {!selectedTemplate && !selectedFilter && 'Mengoptimalkan kualitas foto'}
          </p>
        </div>

        {/* Fun message */}
        <div className="mt-6 inline-block bg-neo-yellow border-[3px] border-black px-5 py-2 shadow-neo">
          <p className="text-lg text-black font-bold">
            Tunggu sebentar, kami sedang membuat foto Anda sempurna!
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProcessingScreen;

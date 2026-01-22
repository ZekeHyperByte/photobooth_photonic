import React, { useState } from 'react';
import { useUIStore } from '../stores/uiStore';
import { useSessionStore } from '../stores/sessionStore';
import { usePhotoStore } from '../stores/photoStore';
import { useIpc } from '../hooks/useIpc';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { NumPad } from '../components/ui/NumPad';
import { deliveryService } from '../services/deliveryService';
import { formatPhoneNumber, isValidPhoneNumber } from '@photonic/utils';

const DeliveryScreen: React.FC = () => {
  const { showToast, resetToIdle } = useUIStore();
  const { session, resetSession } = useSessionStore();
  const { photos, resetPhotos } = usePhotoStore();
  const { print, isElectron } = useIpc();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [whatsappSuccess, setWhatsappSuccess] = useState(false);
  const [printSuccess, setPrintSuccess] = useState(false);

  const handleSendAndPrint = async () => {
    // Validate phone number
    if (!isValidPhoneNumber(phoneNumber)) {
      showToast({
        type: 'error',
        message: 'Nomor telepon tidak valid. Gunakan format: 08xx atau +628xx',
      });
      return;
    }

    if (!session) {
      showToast({
        type: 'error',
        message: 'Session tidak ditemukan',
      });
      return;
    }

    try {
      setIsSending(true);

      // Format phone number
      const formattedPhone = formatPhoneNumber(phoneNumber);

      console.log('[DeliveryScreen] Sending session photos:', {
        sessionId: session.id,
        phoneNumber: formattedPhone,
        photoCount: photos.length,
      });

      // Step 1: Send ALL session photos via WhatsApp (batch: 3 raw + 1 A3 composite)
      const result = await deliveryService.sendSessionPhotos(
        session.id,
        formattedPhone
      );

      console.log('[DeliveryScreen] WhatsApp send result:', result);

      setWhatsappSuccess(true);

      showToast({
        type: 'success',
        message: `${result.totalPhotos || 4} foto berhasil dikirim via WhatsApp!`,
      });

      // Step 2: Print ONLY the A3 composite
      const compositePhotoId = session.metadata?.compositePhotoId;

      if (compositePhotoId) {
        const compositePhoto = photos.find((p) => p.id === compositePhotoId);

        if (compositePhoto) {
          console.log('[DeliveryScreen] Printing A3 composite:', compositePhoto.id);

          // Queue print job in backend
          await deliveryService.queuePrint(compositePhoto.id, 1);

          // If Electron is available, also trigger local print
          if (isElectron && compositePhoto.processedPath) {
            await print(compositePhoto.processedPath, 1);
          }

          setPrintSuccess(true);

          showToast({
            type: 'success',
            message: 'Foto A3 sedang dicetak!',
          });
        } else {
          console.warn('[DeliveryScreen] Composite photo not found in photos array');
        }
      } else {
        console.warn('[DeliveryScreen] No composite photo ID in session metadata');
      }
    } catch (error) {
      console.error('Failed to send and print:', error);
      showToast({
        type: 'error',
        message: 'Gagal mengirim atau mencetak foto. Silakan coba lagi.',
      });
    } finally {
      setIsSending(false);
    }
  };

  const handleFinish = () => {
    resetPhotos();
    resetSession();
    resetToIdle();
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-neo-cyan">
      <div className="w-full max-w-xl">
        {/* Header */}
        <div className="text-center mb-3">
          <div className="inline-block bg-black px-4 py-2 mb-2">
            <h1 className="text-2xl font-bold text-neo-cyan">
              Kirim dan Cetak Foto
            </h1>
          </div>
          <p className="text-lg text-black font-bold">
            {photos.length} foto siap untuk dikirim dan dicetak
          </p>
        </div>

        {/* Single Card - WhatsApp Input + Auto Print */}
        <Card className="p-4 mb-3">
          {!whatsappSuccess || !printSuccess ? (
            <>
              <div className="text-center mb-3">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="bg-neo-lime border-[2px] border-black px-2 py-0.5 shadow-neo-sm">
                    <span className="text-lg font-bold">WA</span>
                  </div>
                  <div className="bg-neo-yellow border-[2px] border-black px-2 py-0.5 shadow-neo-sm">
                    <span className="text-lg font-bold">PRINT</span>
                  </div>
                  <h2 className="text-xl font-bold text-black">
                    Masukkan Nomor WhatsApp
                  </h2>
                </div>
                <p className="text-sm text-black">
                  Foto akan dikirim ke WhatsApp Anda dan dicetak otomatis
                </p>
              </div>

              <div className="space-y-2">
                {/* Phone Number Display */}
                <div className="w-full px-4 py-2 text-xl font-bold border-[2px] border-black bg-white text-center tracking-wider min-h-[48px] flex items-center justify-center">
                  {phoneNumber ? (
                    <span>+62 {phoneNumber}</span>
                  ) : (
                    <span className="text-gray-400">+62 ...</span>
                  )}
                </div>

                {/* NumPad */}
                <NumPad
                  value={phoneNumber}
                  onChange={setPhoneNumber}
                  maxLength={13}
                  onSubmit={handleSendAndPrint}
                  disabled={isSending}
                  showConfirm={false}
                  compact
                />

                <Button
                  onClick={handleSendAndPrint}
                  loading={isSending}
                  disabled={!phoneNumber || isSending}
                  className="w-full"
                  size="medium"
                >
                  {isSending ? 'Mengirim & Mencetak...' : 'Kirim & Cetak Sekarang'}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="bg-neo-lime border-[3px] border-black p-4">
                <p className="text-xl font-bold text-black text-center mb-1">
                  Berhasil Dikirim!
                </p>
                <p className="text-base text-black text-center">
                  Foto telah dikirim ke WhatsApp Anda
                </p>
              </div>
              <div className="bg-neo-lime border-[3px] border-black p-4">
                <p className="text-xl font-bold text-black text-center mb-1">
                  Sedang Mencetak!
                </p>
                <p className="text-base text-black text-center">
                  Ambil foto Anda di printer
                </p>
              </div>
            </div>
          )}
        </Card>

        {/* Finish Button */}
        <div className="text-center">
          <Button onClick={handleFinish} size="medium" variant="success">
            Selesai
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DeliveryScreen;

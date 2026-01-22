import React from 'react';
import { useUIStore } from '../stores/uiStore';
import { Button } from '../components/ui/Button';

const IdleScreen: React.FC = () => {
  const { setScreen } = useUIStore();

  const handleStart = () => {
    setScreen('payment-method');
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-neo-yellow">
      <div className="text-center space-y-8">
        {/* Logo/Branding */}
        <div className="mb-12">
          <div className="inline-block bg-black px-8 py-4 mb-6">
            <h1 className="text-5xl font-bold text-neo-yellow">
              PHOTONIC
            </h1>
          </div>
          <p className="text-2xl text-black font-bold">
            Photo Booth Otomatis
          </p>
        </div>

        {/* Sample photos showcase */}
        <div className="my-12">
          <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="aspect-square bg-neo-cream border-4 border-black shadow-neo"
                style={{
                  transform: `rotate(${(i - 2) * 3}deg)`,
                }}
              />
            ))}
          </div>
        </div>

        {/* CTA Button */}
        <div className="mt-8">
          <Button
            onClick={handleStart}
            size="large"
            className="text-xl py-4 px-12 shadow-neo-lg active:shadow-none"
          >
            Sentuh untuk Memulai
          </Button>
        </div>

        {/* Info text */}
        <div className="mt-8 inline-block bg-black px-6 py-3">
          <p className="text-base text-neo-yellow font-bold">
            Foto berkualitas tinggi • Cetak instan • Kirim via WhatsApp
          </p>
        </div>
      </div>
    </div>
  );
};

export default IdleScreen;

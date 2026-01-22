import React from 'react';
import { useUIStore } from '../stores/uiStore';

/**
 * PaymentMethodScreen
 * Allows customer to choose between QRIS payment or Voucher code
 */
const PaymentMethodScreen: React.FC = () => {
  const { setScreen, resetToIdle } = useUIStore();

  const handleVoucherSelect = () => {
    setScreen('code-entry');
  };

  const handleBack = () => {
    resetToIdle();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-neo-cyan p-8">
      <div className="bg-neo-cream border-[3px] border-black shadow-neo-lg p-8 max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-block bg-black px-6 py-2 mb-4">
            <h1 className="text-3xl font-bold text-neo-cyan">
              Pilih Metode Pembayaran
            </h1>
          </div>
        </div>

        {/* Payment Options */}
        <div className="space-y-6">
          {/* QRIS Option - Disabled */}
          <button
            disabled
            className="w-full min-h-[140px] bg-gray-200 border-[3px] border-gray-400 p-6 text-left opacity-50 cursor-not-allowed relative"
          >
            {/* Coming Soon Badge */}
            <div className="absolute top-3 right-3 bg-gray-500 px-3 py-1 border-2 border-gray-600">
              <span className="text-white text-sm font-bold">Segera Hadir</span>
            </div>

            <div className="flex items-center gap-4">
              {/* QRIS Icon Placeholder */}
              <div className="w-16 h-16 bg-gray-300 border-2 border-gray-400 flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z"
                  />
                </svg>
              </div>

              <div className="flex-1">
                <h2 className="text-2xl font-bold text-gray-500 mb-2">
                  Bayar Langsung QRIS
                </h2>
                <p className="text-gray-500 font-medium">
                  Scan dan bayar langsung menggunakan QRIS
                </p>
              </div>
            </div>
          </button>

          {/* Voucher Option - Active */}
          <button
            onClick={handleVoucherSelect}
            className="w-full min-h-[140px] bg-neo-yellow border-[3px] border-black shadow-neo p-6 text-left hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all"
          >
            <div className="flex items-center gap-4">
              {/* Voucher Icon Placeholder */}
              <div className="w-16 h-16 bg-neo-cream border-[3px] border-black flex items-center justify-center">
                <svg
                  className="w-10 h-10 text-black"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z"
                  />
                </svg>
              </div>

              <div className="flex-1">
                <h2 className="text-2xl font-bold text-black mb-2">
                  Voucher
                </h2>
                <p className="text-black font-medium">
                  Masukkan kode voucher dari kasir
                </p>
              </div>

              {/* Arrow indicator */}
              <div className="text-black">
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
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </div>
            </div>
          </button>
        </div>

        {/* Back Button */}
        <div className="mt-8 text-center">
          <button
            onClick={handleBack}
            className="bg-white border-[3px] border-black shadow-neo px-8 py-3 font-bold hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none active:translate-x-[4px] active:translate-y-[4px] active:shadow-none transition-all"
          >
            Kembali
          </button>
        </div>
      </div>
    </div>
  );
};

export default PaymentMethodScreen;

import { useUIStore } from '../stores/uiStore';
import axios from 'axios';

export enum ErrorType {
  NETWORK = 'network',
  PAYMENT = 'payment',
  CAMERA = 'camera',
  TIMEOUT = 'timeout',
  UNKNOWN = 'unknown',
}

export interface AppError {
  type: ErrorType;
  message: string;
  recoverable: boolean;
}

export const handleError = (error: unknown): AppError => {
  const uiStore = useUIStore.getState();

  let appError: AppError;

  if (axios.isAxiosError(error)) {
    appError = {
      type: ErrorType.NETWORK,
      message: 'Tidak dapat terhubung ke server. Silakan coba lagi.',
      recoverable: true,
    };
  } else if (error instanceof Error) {
    if (error.message.includes('camera')) {
      appError = {
        type: ErrorType.CAMERA,
        message: 'Kamera tidak tersedia. Silakan hubungi petugas.',
        recoverable: false,
      };
    } else if (error.message.includes('payment') || error.message.includes('timeout')) {
      appError = {
        type: ErrorType.PAYMENT,
        message: 'Pembayaran gagal atau kedaluwarsa. Silakan coba lagi.',
        recoverable: true,
      };
    } else {
      appError = {
        type: ErrorType.UNKNOWN,
        message: error.message || 'Terjadi kesalahan. Silakan coba lagi.',
        recoverable: true,
      };
    }
  } else {
    appError = {
      type: ErrorType.UNKNOWN,
      message: 'Terjadi kesalahan. Silakan coba lagi.',
      recoverable: true,
    };
  }

  // Show error screen
  uiStore.setError(appError);

  return appError;
};

import { create } from 'zustand';

export type ScreenType =
  | 'idle'
  | 'payment-method'    // Choose payment method (QRIS or Voucher)
  | 'code-entry'        // Enter 4-digit booth code
  | 'session-notice'    // Session time limit notice before starting
  | 'frame-selection'   // Select frame/template before capture
  | 'capture'
  | 'photo-review'      // Review photos before filter selection
  | 'filter-selection'  // Select filter after capture
  | 'processing'
  | 'preview'
  | 'delivery'
  | 'error';

export interface Toast {
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface AppError {
  type: 'network' | 'payment' | 'camera' | 'timeout' | 'unknown';
  message: string;
  recoverable: boolean;
}

export interface RetakeMode {
  active: boolean;
  photoIndex: number;
  photoId: string;
}

interface UIState {
  currentScreen: ScreenType;
  isLoading: boolean;
  error: AppError | null;
  toast: Toast | null;
  retakeMode: RetakeMode | null;

  // Actions
  setScreen: (screen: ScreenType) => void;
  showToast: (toast: Toast) => void;
  hideToast: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: AppError | null) => void;
  resetToIdle: () => void;
  startRetake: (photoIndex: number, photoId: string) => void;
  clearRetakeMode: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentScreen: 'idle',
  isLoading: false,
  error: null,
  toast: null,
  retakeMode: null,

  setScreen: (screen) => set({ currentScreen: screen, error: null }),

  showToast: (toast) => set({ toast }),

  hideToast: () => set({ toast: null }),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error, currentScreen: error ? 'error' : 'idle' }),

  resetToIdle: () =>
    set({
      currentScreen: 'idle',
      isLoading: false,
      error: null,
      toast: null,
      retakeMode: null,
    }),

  startRetake: (photoIndex, photoId) =>
    set({
      retakeMode: { active: true, photoIndex, photoId },
      currentScreen: 'capture',
    }),

  clearRetakeMode: () => set({ retakeMode: null }),
}));

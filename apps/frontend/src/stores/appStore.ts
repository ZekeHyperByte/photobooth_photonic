import { create } from 'zustand';
import type { Package, Template, Filter } from '@photonic/types';

interface AppState {
  packages: Package[];
  templates: Template[];
  filters: Filter[];
  kioskMode: boolean;
  isOnline: boolean;

  // Actions
  setPackages: (packages: Package[]) => void;
  setTemplates: (templates: Template[]) => void;
  setFilters: (filters: Filter[]) => void;
  setKioskMode: (enabled: boolean) => void;
  setOnlineStatus: (online: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  packages: [],
  templates: [],
  filters: [],
  kioskMode: import.meta.env.VITE_KIOSK_MODE === 'true',
  isOnline: true,

  setPackages: (packages) => set({ packages }),

  setTemplates: (templates) => set({ templates }),

  setFilters: (filters) => set({ filters }),

  setKioskMode: (enabled) => set({ kioskMode: enabled }),

  setOnlineStatus: (online) => set({ isOnline: online }),
}));

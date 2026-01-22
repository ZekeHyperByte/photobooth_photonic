import { create } from 'zustand';
import type { Session, Package, Template } from '@photonic/types';

interface SessionTimer {
  startTime: number | null;
  timeLimit: number;
  isActive: boolean;
}

interface SessionState {
  session: Session | null;
  selectedPackage: Package | null;
  selectedTemplate: Template | null;
  sessionTimer: SessionTimer;

  // Actions
  setSession: (session: Session) => void;
  updateSession: (updates: Partial<Session>) => void;
  setSelectedPackage: (pkg: Package | null) => void;
  setSelectedTemplate: (template: Template | null) => void;
  resetSession: () => void;

  // Timer actions
  startSessionTimer: (timeLimitSeconds: number) => void;
  stopSessionTimer: () => void;
  getElapsedTime: () => number;
  getRemainingTime: () => number;
  isTimerExpired: () => boolean;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  session: null,
  selectedPackage: null,
  selectedTemplate: null,
  sessionTimer: {
    startTime: null,
    timeLimit: 0,
    isActive: false,
  },

  setSession: (session) => set({ session }),

  updateSession: (updates) =>
    set((state) => ({
      session: state.session ? { ...state.session, ...updates } : null,
    })),

  setSelectedPackage: (pkg) => set({ selectedPackage: pkg }),

  setSelectedTemplate: (template) => set({ selectedTemplate: template }),

  resetSession: () =>
    set({
      session: null,
      selectedPackage: null,
      selectedTemplate: null,
      sessionTimer: {
        startTime: null,
        timeLimit: 0,
        isActive: false,
      },
    }),

  // Timer actions
  startSessionTimer: (timeLimitSeconds) =>
    set({
      sessionTimer: {
        startTime: Date.now(),
        timeLimit: timeLimitSeconds || 300, // Fallback to 300 seconds (5 minutes)
        isActive: true,
      },
    }),

  stopSessionTimer: () =>
    set((state) => ({
      sessionTimer: {
        ...state.sessionTimer,
        isActive: false,
      },
    })),

  getElapsedTime: () => {
    const state = get();
    if (!state.sessionTimer.startTime) return 0;
    return Math.floor((Date.now() - state.sessionTimer.startTime) / 1000);
  },

  getRemainingTime: () => {
    const state = get();
    const elapsed = state.getElapsedTime();
    return Math.max(0, state.sessionTimer.timeLimit - elapsed);
  },

  isTimerExpired: () => {
    const state = get();
    return state.sessionTimer.isActive && state.getRemainingTime() === 0;
  },
}));

import { create } from 'zustand';
import type { Photo, Template, Filter } from '@photonic/types';

interface PhotoState {
  photos: Photo[];
  selectedTemplate: Template | null;
  selectedFilter: Filter | null;

  // Actions
  addPhoto: (photo: Photo) => void;
  updatePhoto: (photoId: string, updates: Partial<Photo>) => void;
  setPhotos: (photos: Photo[]) => void;
  selectTemplate: (template: Template | null) => void;
  selectFilter: (filter: Filter | null) => void;
  resetPhotos: () => void;
}

export const usePhotoStore = create<PhotoState>((set) => ({
  photos: [],
  selectedTemplate: null,
  selectedFilter: null,

  addPhoto: (photo) =>
    set((state) => {
      // Prevent duplicate photos
      if (state.photos.some((p) => p.id === photo.id)) {
        return state; // No change if photo already exists
      }
      return {
        photos: [...state.photos, photo],
      };
    }),

  updatePhoto: (photoId, updates) =>
    set((state) => ({
      photos: state.photos.map((p) =>
        p.id === photoId ? { ...p, ...updates } : p
      ),
    })),

  setPhotos: (photos) => set({ photos }),

  selectTemplate: (template) => set({ selectedTemplate: template }),

  selectFilter: (filter) => set({ selectedFilter: filter }),

  resetPhotos: () =>
    set({
      photos: [],
      selectedTemplate: null,
      selectedFilter: null,
    }),
}));

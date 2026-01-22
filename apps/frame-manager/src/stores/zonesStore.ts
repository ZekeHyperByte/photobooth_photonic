import { create } from 'zustand';
import { nanoid } from 'nanoid';

export interface PhotoZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
}

interface ZonesState {
  zones: PhotoZone[];
  selectedZoneId: string | null;

  // Actions
  addZone: (zone?: Partial<PhotoZone>) => void;
  updateZone: (id: string, updates: Partial<PhotoZone>) => void;
  removeZone: (id: string) => void;
  selectZone: (id: string | null) => void;
  clearZones: () => void;
  reorderZone: (id: string, direction: 'up' | 'down') => void;
  loadZones: (zones: PhotoZone[]) => void;
}

export const useZonesStore = create<ZonesState>((set) => ({
  zones: [],
  selectedZoneId: null,

  addZone: (zone) =>
    set((state) => {
      const newZone: PhotoZone = {
        id: nanoid(),
        x: 100,
        y: 100,
        width: 800,
        height: 600,
        rotation: 0,
        zIndex: state.zones.length,
        ...zone,
      };
      return { zones: [...state.zones, newZone], selectedZoneId: newZone.id };
    }),

  updateZone: (id, updates) =>
    set((state) => ({
      zones: state.zones.map((zone) =>
        zone.id === id ? { ...zone, ...updates } : zone
      ),
    })),

  removeZone: (id) =>
    set((state) => ({
      zones: state.zones.filter((zone) => zone.id !== id),
      selectedZoneId: state.selectedZoneId === id ? null : state.selectedZoneId,
    })),

  selectZone: (id) => set({ selectedZoneId: id }),

  clearZones: () => set({ zones: [], selectedZoneId: null }),

  reorderZone: (id, direction) =>
    set((state) => {
      const zones = [...state.zones];
      const index = zones.findIndex((z) => z.id === id);
      if (index === -1) return state;

      const newIndex = direction === 'up' ? index + 1 : index - 1;
      if (newIndex < 0 || newIndex >= zones.length) return state;

      // Swap zIndex values
      const temp = zones[index].zIndex;
      zones[index].zIndex = zones[newIndex].zIndex;
      zones[newIndex].zIndex = temp;

      return { zones };
    }),

  loadZones: (zones: PhotoZone[]) =>
    set({
      zones: zones.map((zone, index) => ({
        id: zone.id || nanoid(),
        x: zone.x,
        y: zone.y,
        width: zone.width,
        height: zone.height,
        rotation: zone.rotation || 0,
        zIndex: zone.zIndex ?? index,
      })),
      selectedZoneId: null,
    }),
}));

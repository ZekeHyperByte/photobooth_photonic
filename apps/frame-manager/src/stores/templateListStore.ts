import { create } from 'zustand';
import { api, Template } from '../services/api';

interface TemplateListState {
  templates: Template[];
  isLoading: boolean;
  error: string | null;
  selectedTemplateId: string | null;

  // Actions
  fetchTemplates: () => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  toggleActive: (id: string) => Promise<void>;
  setSelectedTemplate: (id: string | null) => void;
  updateTemplateInList: (template: Template) => void;
}

export const useTemplateListStore = create<TemplateListState>((set, get) => ({
  templates: [],
  isLoading: false,
  error: null,
  selectedTemplateId: null,

  fetchTemplates: async () => {
    set({ isLoading: true, error: null });
    try {
      const templates = await api.getTemplates();
      set({ templates, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch templates',
        isLoading: false,
      });
    }
  },

  deleteTemplate: async (id: string) => {
    try {
      await api.deleteTemplate(id);
      set((state) => ({
        templates: state.templates.filter((t) => t.id !== id),
        selectedTemplateId:
          state.selectedTemplateId === id ? null : state.selectedTemplateId,
      }));
    } catch (error) {
      throw error;
    }
  },

  toggleActive: async (id: string) => {
    const template = get().templates.find((t) => t.id === id);
    if (!template) return;

    const newIsActive = !template.isActive;

    // Optimistic update - update UI immediately
    set((state) => ({
      templates: state.templates.map((t) =>
        t.id === id ? { ...t, isActive: newIsActive } : t
      ),
    }));

    try {
      const updated = await api.updateTemplate(id, { isActive: newIsActive });
      // If API returns updated template, use it; otherwise keep optimistic update
      if (updated) {
        set((state) => ({
          templates: state.templates.map((t) => (t.id === id ? updated : t)),
        }));
      }
    } catch (error) {
      // Revert on error
      set((state) => ({
        templates: state.templates.map((t) =>
          t.id === id ? { ...t, isActive: !newIsActive } : t
        ),
      }));
      throw error;
    }
  },

  setSelectedTemplate: (id: string | null) => {
    set({ selectedTemplateId: id });
  },

  updateTemplateInList: (template: Template) => {
    set((state) => ({
      templates: state.templates.map((t) => (t.id === template.id ? template : t)),
    }));
  },
}));

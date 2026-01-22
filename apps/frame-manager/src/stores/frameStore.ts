import { create } from 'zustand';
import { api, Template } from '../services/api';
import type { PaperSize } from '@photonic/types';

interface FrameState {
  frameUrl: string | null;
  framePath: string | null;
  frameId: string | null;
  canvasWidth: number;
  canvasHeight: number;
  paperSize: PaperSize | null;
  detectedPaperSize: PaperSize | null;
  isLoading: boolean;
  isEditing: boolean;
  editingTemplateId: string | null;
  templateName: string;
  templateDescription: string;

  // Actions
  setFrame: (url: string, path: string, frameId: string, width: number, height: number, detectedPaperSize: PaperSize) => void;
  setCanvasSize: (width: number, height: number) => void;
  setPaperSize: (size: PaperSize) => void;
  setDetectedPaperSize: (size: PaperSize) => void;
  setLoading: (loading: boolean) => void;
  clearFrame: () => void;
  loadTemplate: (template: Template) => void;
  setTemplateName: (name: string) => void;
  setTemplateDescription: (description: string) => void;
  resetEditor: () => void;
}

export const useFrameStore = create<FrameState>((set) => ({
  frameUrl: null,
  framePath: null,
  frameId: null,
  canvasWidth: 3508, // Default A3 width
  canvasHeight: 4960, // Default A3 height
  paperSize: null,
  detectedPaperSize: null,
  isLoading: false,
  isEditing: false,
  editingTemplateId: null,
  templateName: '',
  templateDescription: '',

  setFrame: (url, path, frameId, width, height, detectedPaperSize) =>
    set({
      frameUrl: url,
      framePath: path,
      frameId,
      canvasWidth: width,
      canvasHeight: height,
      detectedPaperSize,
      paperSize: detectedPaperSize, // Default to detected
      isEditing: false,
      editingTemplateId: null,
    }),

  setCanvasSize: (width, height) =>
    set({ canvasWidth: width, canvasHeight: height }),

  setPaperSize: (size: PaperSize) => set({ paperSize: size }),

  setDetectedPaperSize: (size: PaperSize) => set({ detectedPaperSize: size }),

  setLoading: (loading) => set({ isLoading: loading }),

  clearFrame: () =>
    set({
      frameUrl: null,
      framePath: null,
      frameId: null,
      paperSize: null,
      detectedPaperSize: null,
      isEditing: false,
      editingTemplateId: null,
      templateName: '',
      templateDescription: '',
    }),

  loadTemplate: (template: Template) => {
    const frameUrl = api.getFileUrl(template.filePath);
    // canvasWidth/canvasHeight might be stored in positionData or at template level
    const canvasWidth = template.canvasWidth || template.positionData?.canvasWidth || 3508;
    const canvasHeight = template.canvasHeight || template.positionData?.canvasHeight || 4960;
    const paperSize = template.paperSize || 'A3';
    set({
      frameUrl,
      framePath: template.filePath,
      frameId: template.id,
      canvasWidth,
      canvasHeight,
      paperSize,
      detectedPaperSize: paperSize,
      isEditing: true,
      editingTemplateId: template.id,
      templateName: template.name || '',
      templateDescription: template.description || '',
    });
  },

  setTemplateName: (name: string) => set({ templateName: name }),

  setTemplateDescription: (description: string) => set({ templateDescription: description }),

  resetEditor: () =>
    set({
      frameUrl: null,
      framePath: null,
      frameId: null,
      canvasWidth: 3508,
      canvasHeight: 4960,
      paperSize: null,
      detectedPaperSize: null,
      isLoading: false,
      isEditing: false,
      editingTemplateId: null,
      templateName: '',
      templateDescription: '',
    }),
}));

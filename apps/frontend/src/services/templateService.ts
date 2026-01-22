import { apiClient } from './api';
import type { Template } from '@photonic/types';
import { ENDPOINTS } from '@photonic/config';

// API base URL for direct URL construction (e.g., image src attributes)
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const templateService = {
  /**
   * Get all active templates (for customer selection)
   */
  getActiveTemplates: async (): Promise<Template[]> => {
    const response = await apiClient.get(`${ENDPOINTS.TEMPLATES}?active=true`);
    return response.data.data || response.data;
  },

  /**
   * Get all templates (admin view)
   */
  getAllTemplates: async (): Promise<Template[]> => {
    const response = await apiClient.get(ENDPOINTS.TEMPLATES);
    return response.data.data || response.data;
  },

  /**
   * Get a single template by ID
   */
  getTemplate: async (id: string): Promise<Template> => {
    const response = await apiClient.get(`${ENDPOINTS.TEMPLATES}/${id}`);
    return response.data.data || response.data;
  },

  /**
   * Get template preview URL
   * Preview shows template applied to sample photo
   * @param templateId - The template ID
   * @param updatedAt - Optional updatedAt timestamp for cache-busting
   */
  getPreviewUrl: (templateId: string, updatedAt?: Date | string): string => {
    const baseUrl = `${API_BASE_URL}${ENDPOINTS.TEMPLATES}/${templateId}/preview`;
    if (updatedAt) {
      const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
      return `${baseUrl}?t=${timestamp}`;
    }
    return baseUrl;
  },

  /**
   * Get template thumbnail URL
   * Thumbnail shows just the template image
   * @param templateId - The template ID
   * @param updatedAt - Optional updatedAt timestamp for cache-busting
   */
  getThumbnailUrl: (templateId: string, updatedAt?: Date | string): string => {
    const baseUrl = `${API_BASE_URL}${ENDPOINTS.TEMPLATES}/${templateId}/thumbnail`;
    if (updatedAt) {
      const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
      return `${baseUrl}?t=${timestamp}`;
    }
    return baseUrl;
  },
};

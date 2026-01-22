import { apiClient } from './api';
import { API_ENDPOINTS } from '@photonic/config';

/**
 * Filter Service
 * Handles filter retrieval and management
 */

export const filterService = {
  /**
   * Get all active filters
   */
  getAll: async (): Promise<any[]> => {
    try {
      const response = await apiClient.get(API_ENDPOINTS.FILTERS);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Failed to fetch filters:', error);
      throw error;
    }
  },

  /**
   * Get a single filter by ID
   */
  getById: async (filterId: string): Promise<any> => {
    try {
      const response = await apiClient.get(`${API_ENDPOINTS.FILTERS}/${filterId}`);
      return response.data.data || response.data;
    } catch (error) {
      console.error('Failed to fetch filter:', error);
      throw error;
    }
  },
};

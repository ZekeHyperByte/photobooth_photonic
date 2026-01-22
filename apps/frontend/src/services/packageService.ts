import { apiClient } from './api';
import type { Package } from '@photonic/types';
import { API_ENDPOINTS } from '@photonic/config';

export const packageService = {
  /**
   * Get all available packages
   */
  getPackages: async (): Promise<Package[]> => {
    const response = await apiClient.get(API_ENDPOINTS.PACKAGES);
    return response.data.data || response.data;
  },

  /**
   * Get a single package by ID
   */
  getPackage: async (id: string): Promise<Package> => {
    const response = await apiClient.get(`${API_ENDPOINTS.PACKAGES}/${id}`);
    return response.data.data || response.data;
  },
};

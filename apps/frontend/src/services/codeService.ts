import { apiClient } from './api';

/**
 * Code Service
 * Handles booth code verification
 */
export const codeService = {
  /**
   * Verify a 4-digit booth code
   * Does not consume the code - just checks if it's valid
   */
  verify: async (code: string): Promise<{ valid: boolean }> => {
    try {
      const response = await apiClient.post('/api/codes/verify', {
        code,
      });

      return response.data.data;
    } catch (error) {
      console.error('Code verification failed:', error);
      throw new Error('Kode tidak valid atau sudah digunakan');
    }
  },
};

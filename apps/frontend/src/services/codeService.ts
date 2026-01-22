import axios from 'axios';

/**
 * Code Service
 * Handles booth code verification
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

export const codeService = {
  /**
   * Verify a 4-digit booth code
   * Does not consume the code - just checks if it's valid
   */
  verify: async (code: string): Promise<{ valid: boolean }> => {
    try {
      const response = await axios.post(`${API_BASE_URL}/api/codes/verify`, {
        code,
      });

      return response.data.data;
    } catch (error) {
      console.error('Code verification failed:', error);
      throw new Error('Kode tidak valid atau sudah digunakan');
    }
  },
};

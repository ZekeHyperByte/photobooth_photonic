import { apiClient } from './api';
import type { Session } from '@photonic/types';
import { API_ENDPOINTS } from '@photonic/config';

export const sessionService = {
  /**
   * Create a new session with booth code or package ID (legacy)
   */
  create: async (data: { code?: string; packageId?: string; phoneNumber?: string }): Promise<Session> => {
    const response = await apiClient.post(API_ENDPOINTS.SESSIONS, data);
    return response.data.data || response.data;
  },

  /**
   * Create a new session (legacy method for backward compatibility)
   * @deprecated Use create() with code instead
   */
  createSession: async (packageId: string): Promise<Session> => {
    const response = await apiClient.post(API_ENDPOINTS.SESSIONS, {
      packageId,
    });
    return response.data.data || response.data;
  },

  /**
   * Get session by ID
   */
  getSession: async (sessionId: string): Promise<Session> => {
    const response = await apiClient.get(
      `${API_ENDPOINTS.SESSIONS}/${sessionId}`
    );
    return response.data.data || response.data;
  },

  /**
   * Update session
   */
  updateSession: async (
    sessionId: string,
    updates: Partial<Session>
  ): Promise<Session> => {
    const response = await apiClient.patch(
      `${API_ENDPOINTS.SESSIONS}/${sessionId}`,
      updates
    );
    return response.data.data || response.data;
  },

  /**
   * Select a template for the session
   * Updates the session metadata with the selected template's photoCount
   */
  selectTemplate: async (
    sessionId: string,
    templateId: string
  ): Promise<Session> => {
    const response = await apiClient.patch(
      `${API_ENDPOINTS.SESSIONS}/${sessionId}`,
      { templateId }
    );
    return response.data.data || response.data;
  },
};

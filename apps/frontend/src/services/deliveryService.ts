import { apiClient } from './api';

export const deliveryService = {
  /**
   * Send photo via WhatsApp
   */
  sendWhatsApp: async (
    photoId: string,
    phoneNumber: string
  ): Promise<any> => {
    const response = await apiClient.post(
      `/api/delivery/whatsapp/${photoId}`,
      {
        phoneNumber,
      }
    );
    return response.data.data || response.data;
  },

  /**
   * Get WhatsApp delivery status
   */
  getWhatsAppStatus: async (deliveryId: string): Promise<any> => {
    const response = await apiClient.get(
      `/api/delivery/whatsapp/${deliveryId}/status`
    );
    return response.data.data || response.data;
  },

  /**
   * Queue photo for printing
   */
  queuePrint: async (photoId: string, copies: number = 1): Promise<any> => {
    const response = await apiClient.post(`/api/delivery/print/${photoId}`, {
      copies,
    });
    return response.data.data || response.data;
  },

  /**
   * Get print job status
   */
  getPrintStatus: async (printJobId: string): Promise<any> => {
    const response = await apiClient.get(
      `/api/delivery/print/${printJobId}/status`
    );
    return response.data.data || response.data;
  },

  /**
   * Get pending print jobs
   */
  getPendingPrintJobs: async (): Promise<any[]> => {
    const response = await apiClient.get('/api/delivery/print/pending');
    return response.data.data || response.data;
  },

  /**
   * Update print job status
   */
  updatePrintStatus: async (
    printJobId: string,
    status: string
  ): Promise<any> => {
    const response = await apiClient.put(
      `/api/delivery/print/${printJobId}/status`,
      { status }
    );
    return response.data.data || response.data;
  },

  /**
   * Cancel print job
   */
  cancelPrintJob: async (printJobId: string): Promise<void> => {
    await apiClient.delete(`/api/delivery/print/${printJobId}`);
  },

  /**
   * Host a session's photos on the central server.
   * Returns a shareable download URL + QR data-URL (Phase 3).
   */
  hostSession: async (
    sessionId: string
  ): Promise<{ shareId: string; downloadUrl: string; qrDataUrl: string; count: number }> => {
    const response = await apiClient.post('/api/delivery/host/session', { sessionId });
    return response.data.data || response.data;
  },

  /**
   * Deliver an already-hosted session via WhatsApp from the central server (Phase 3b).
   */
  deliverViaCentral: async (
    shareId: string,
    phoneNumber: string
  ): Promise<{ sent: number; failed: number }> => {
    const response = await apiClient.post('/api/delivery/host/whatsapp', {
      shareId,
      phoneNumber,
    });
    return response.data.data || response.data;
  },

  /**
   * Send all session photos via WhatsApp (batch)
   * Sends 3 raw photos + 1 A3 composite
   */
  sendSessionPhotos: async (
    sessionId: string,
    phoneNumber: string
  ): Promise<{ deliveryIds: string[]; totalPhotos: number }> => {
    console.log('[deliveryService] Sending session photos:', { sessionId, phoneNumber });

    try {
      const response = await apiClient.post(
        '/api/delivery/whatsapp/session',
        {
          sessionId,
          phoneNumber,
        }
      );

      console.log('[deliveryService] Session photos sent:', response.data);

      return response.data.data || response.data;
    } catch (error: any) {
      console.error('[deliveryService] Failed to send session photos:', error.response?.data || error.message);
      throw error;
    }
  },
};

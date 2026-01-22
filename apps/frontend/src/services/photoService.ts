import { apiClient } from './api';
import type { Photo } from '@photonic/types';
import { API_ENDPOINTS } from '@photonic/config';

export const photoService = {
  /**
   * Capture a photo via bridge/camera service
   */
  capture: async (sessionId: string): Promise<Photo> => {
    const response = await apiClient.post(`${API_ENDPOINTS.PHOTOS}/capture`, {
      sessionId,
    });
    return response.data.data || response.data;
  },

  /**
   * Upload a photo captured from browser webcam
   * @param retakePhotoId - Optional ID of photo being retaken
   */
  upload: async (sessionId: string, imageBlob: Blob, retakePhotoId?: string): Promise<Photo> => {
    // Convert blob to base64
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(imageBlob);
    });

    console.log('[photoService] Uploading photo, sessionId:', sessionId, 'blob size:', imageBlob.size, 'retakePhotoId:', retakePhotoId);

    try {
      const response = await apiClient.post(`${API_ENDPOINTS.PHOTOS}/upload`, {
        sessionId,
        imageData: base64,
        retakePhotoId,
      });
      console.log('[photoService] Upload response:', response.data);

      // Extract photo and URL from response
      const data = response.data.data || response.data;
      const photo = data.photo || data;
      const captureUrl = data.captureUrl;

      // Build full URL for originalPath if we have a relative path
      if (captureUrl) {
        const fullUrl = captureUrl.startsWith('/')
          ? `${import.meta.env.VITE_API_URL || 'http://localhost:4000'}${captureUrl}`
          : captureUrl;

        return {
          ...photo,
          originalPath: fullUrl,
        };
      }

      return photo;
    } catch (error: any) {
      console.error('[photoService] Upload failed:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Process a photo with template and/or filter
   */
  processPhoto: async (
    photoId: string,
    templateId?: string,
    filterId?: string
  ): Promise<Photo> => {
    const response = await apiClient.post(
      `${API_ENDPOINTS.PHOTOS}/${photoId}/process`,
      {
        templateId,
        filterId,
      }
    );
    return response.data.data || response.data;
  },

  /**
   * Get photos for a session
   */
  getSessionPhotos: async (sessionId: string): Promise<Photo[]> => {
    const response = await apiClient.get(
      `${API_ENDPOINTS.PHOTOS}/session/${sessionId}`
    );
    return response.data.data || response.data;
  },

  /**
   * Get a single photo
   */
  getPhoto: async (photoId: string): Promise<Photo> => {
    const response = await apiClient.get(`${API_ENDPOINTS.PHOTOS}/${photoId}`);
    return response.data.data || response.data;
  },

  /**
   * Create a collage from photos
   */
  createCollage: async (
    photoIds: string[],
    layout: '2x2' | '3x1' | '4x1'
  ): Promise<Photo> => {
    const response = await apiClient.post(`${API_ENDPOINTS.PHOTOS}/collage`, {
      photoIds,
      layout,
    });
    return response.data.data || response.data;
  },

  /**
   * Generate filter preview for a photo
   */
  generateFilterPreview: async (photoId: string, filterId: string): Promise<string> => {
    console.log('[photoService] Generating filter preview:', { photoId, filterId });

    try {
      const response = await apiClient.post(
        `${API_ENDPOINTS.PHOTOS}/${photoId}/preview-filter`,
        { filterId },
        { responseType: 'blob' }
      );

      // Convert blob to object URL for display
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);

      console.log('[photoService] Filter preview generated:', url);
      return url;
    } catch (error: any) {
      console.error('[photoService] Filter preview generation failed:', error.response?.data || error.message);
      throw error;
    }
  },

  /**
   * Create A3 composite from session photos with newspaper template
   */
  createA3Composite: async (
    sessionId: string,
    templateId: string,
    filterId?: string
  ): Promise<Photo> => {
    console.log('[photoService] Creating A3 composite:', { sessionId, templateId, filterId });

    try {
      const response = await apiClient.post(`${API_ENDPOINTS.PHOTOS}/composite-a3`, {
        sessionId,
        templateId,
        filterId,
      });

      console.log('[photoService] A3 composite created:', response.data);

      const data = response.data.data || response.data;
      const photo = data.photo || data;
      const compositeUrl = data.compositeUrl;

      console.log('[photoService] Composite response data:', { photo, compositeUrl });

      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';

      // If compositeUrl provided, use it
      if (compositeUrl) {
        const fullUrl = compositeUrl.startsWith('/')
          ? `${apiUrl}${compositeUrl}`
          : compositeUrl;

        console.log('[photoService] Using compositeUrl:', fullUrl);

        return {
          ...photo,
          processedPath: fullUrl,
          originalPath: fullUrl,
        };
      }

      // Fallback: construct URL from photo.processedPath if it's a filesystem path
      if (photo.processedPath) {
        const filename = photo.processedPath.split('/').pop();
        const fullUrl = `${apiUrl}/data/processed/${filename}`;

        console.log('[photoService] Fallback: constructed URL from processedPath:', fullUrl);

        return {
          ...photo,
          processedPath: fullUrl,
          originalPath: fullUrl,
        };
      }

      console.warn('[photoService] No compositeUrl or processedPath available, returning raw photo');
      return photo;
    } catch (error: any) {
      console.error('[photoService] A3 composite creation failed:', error.response?.data || error.message);
      throw error;
    }
  },
};

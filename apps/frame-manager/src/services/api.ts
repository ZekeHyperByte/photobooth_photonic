import type { PaperSize } from '@photonic/types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export interface Template {
  id: string;
  name: string;
  description: string | null;
  filePath: string;
  thumbnailPath: string | null;
  previewPath: string | null;
  templateType: string;
  positionData: any;
  photoCount: number;
  canvasWidth: number;
  canvasHeight: number;
  paperSize: PaperSize;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UploadFrameResponse {
  frameId: string;
  filePath: string;
  filename: string;
  width: number;
  height: number;
  detectedPaperSize: PaperSize;
}

export const api = {
  /**
   * Upload a frame image
   */
  uploadFrame: async (file: File): Promise<UploadFrameResponse> => {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/templates/upload-frame`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to upload frame');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Create a new template with frame and zones
   */
  createTemplate: async (
    name: string,
    description: string,
    _filePath: string,
    positionData: any
  ): Promise<Template> => {
    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);
    formData.append('templateType', 'frame');
    formData.append('positionData', JSON.stringify(positionData));

    // Read the file from the path and upload it
    const response = await fetch(`${API_URL}/api/templates`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to create template');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Update an existing template
   */
  updateTemplate: async (
    id: string,
    updates: {
      name?: string;
      description?: string;
      positionData?: any;
      paperSize?: PaperSize;
      isActive?: boolean;
    }
  ): Promise<Template> => {
    const response = await fetch(`${API_URL}/api/templates/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to update template');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Get all templates
   */
  getTemplates: async (): Promise<Template[]> => {
    const response = await fetch(`${API_URL}/api/templates`);

    if (!response.ok) {
      throw new Error('Failed to fetch templates');
    }

    const data = await response.json();
    return data.data || [];
  },

  /**
   * Get a single template
   */
  getTemplate: async (id: string): Promise<Template> => {
    const response = await fetch(`${API_URL}/api/templates/${id}`);

    if (!response.ok) {
      throw new Error('Failed to fetch template');
    }

    const data = await response.json();
    return data.data;
  },

  /**
   * Delete a template
   */
  deleteTemplate: async (id: string): Promise<void> => {
    const response = await fetch(`${API_URL}/api/templates/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete template');
    }
  },

  /**
   * Get template thumbnail URL
   * @param id - Template ID
   * @param updatedAt - Optional updatedAt timestamp for cache-busting
   */
  getThumbnailUrl: (id: string, updatedAt?: Date | string): string => {
    const baseUrl = `${API_URL}/api/templates/${id}/thumbnail`;
    if (updatedAt) {
      const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
      return `${baseUrl}?t=${timestamp}`;
    }
    return baseUrl;
  },

  /**
   * Get template preview URL (with sample photos)
   * @param id - Template ID
   * @param updatedAt - Optional updatedAt timestamp for cache-busting
   */
  getPreviewUrl: (id: string, updatedAt?: Date | string): string => {
    const baseUrl = `${API_URL}/api/templates/${id}/preview`;
    if (updatedAt) {
      const timestamp = updatedAt instanceof Date ? updatedAt.getTime() : new Date(updatedAt).getTime();
      return `${baseUrl}?t=${timestamp}`;
    }
    return baseUrl;
  },

  /**
   * Get the URL for a static file
   */
  getFileUrl: (path: string): string => {
    // If it's already a URL, return it
    if (path.startsWith('http')) return path;

    // If it's a /data/ path, prepend API URL
    if (path.startsWith('/data/')) {
      return `${API_URL}${path}`;
    }

    // Extract filename from absolute path
    const filename = path.split('/').pop();
    return `${API_URL}/data/templates/${filename}`;
  },
};

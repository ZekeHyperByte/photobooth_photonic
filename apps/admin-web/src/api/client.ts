const getBaseUrl = (): string => {
  // In production, use the same host as the admin-web is served from
  // In development, default to localhost:4000 (backend port)
  if (import.meta.env.PROD) {
    // When served from backend, API is on same origin
    return window.location.origin;
  }
  // Development: connect to backend on port 4000
  const host = window.location.hostname;
  return `http://${host}:4000`;
};

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
}

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = getBaseUrl();
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  }

  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return response.json();
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  }
}

export const apiClient = new ApiClient();

// Types for admin data
export interface BoothCode {
  id: string;
  code: string;
  status: 'generated' | 'used' | 'expired';
  generatedBy: string;
  generatedAt: string;
  usedAt: string | null;
  usedBySessionId: string | null;
}

export interface DashboardData {
  totalSessions: number;
  completedSessions: number;
  totalRevenue: number;
  totalPhotos: number;
}

// API functions
export const adminApi = {
  getDashboard: () => apiClient.get<DashboardData>('/api/admin/dashboard'),
  getCodes: (status?: string) => {
    const query = status ? `?status=${status}` : '';
    return apiClient.get<BoothCode[]>(`/api/admin/codes${query}`);
  },
  generateCodes: (count: number) =>
    apiClient.post<BoothCode[]>('/api/admin/codes/generate', { count }),
  deleteCode: (code: string) => apiClient.delete(`/api/admin/codes/${code}`),
};

import axios from 'axios';

// Create axios instances for backend and bridge services
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const bridgeClient = axios.create({
  baseURL: import.meta.env.VITE_BRIDGE_URL || 'http://localhost:5000',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

bridgeClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Bridge Error:', error);
    return Promise.reject(error);
  }
);

import axios from 'axios';

// Create axios instance for backend API
export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// DEPRECATED: Bridge service no longer exists
// Camera integration is now built into the backend service
// Keeping this commented for reference in case of legacy code dependencies
/*
export const bridgeClient = axios.create({
  baseURL: import.meta.env.VITE_BRIDGE_URL || 'http://localhost:5000',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});
*/

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error);
    return Promise.reject(error);
  }
);

// DEPRECATED: Bridge client interceptor (no longer needed)
/*
bridgeClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('Bridge Error:', error);
    return Promise.reject(error);
  }
);
*/

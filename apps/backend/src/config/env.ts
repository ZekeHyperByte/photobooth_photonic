import dotenv from 'dotenv';
import path from 'path';
import { ENV_KEYS } from '@photonic/config';

// Load environment variables
dotenv.config();

export const env: {
  nodeEnv: string;
  port: number;
  databasePath: string;
  tempPhotoPath: string;
  mockCamera: boolean;
  useWebcam: boolean;
  digiCamControl: {
    webserverEnabled: boolean;
    host: string;
    port: number;
    timeoutMs: number;
    pollIntervalMs: number;
  };
  midtrans: {
    serverKey: string;
    clientKey: string;
    environment: 'sandbox' | 'production';
  };
  whatsapp: {
    provider: 'fonnte' | 'wablas';
    apiKey: string;
  };
  sync: {
    boothId: string;
    centralServerUrl: string;
    centralServerApiKey: string;
    syncIntervalMs: number;
  };
  isDevelopment: boolean;
  isProduction: boolean;
  devMode: boolean;
} = {
  nodeEnv: process.env[ENV_KEYS.NODE_ENV] || 'development',
  port: parseInt(process.env[ENV_KEYS.BACKEND_PORT] || '4000', 10),
  databasePath: process.env[ENV_KEYS.DATABASE_PATH] || './data/photobooth.db',

  // Camera settings (merged from bridge)
  tempPhotoPath: process.env[ENV_KEYS.TEMP_PHOTO_PATH] || './temp',
  mockCamera: process.env[ENV_KEYS.MOCK_CAMERA] === 'true',
  useWebcam: process.env[ENV_KEYS.USE_WEBCAM] === 'true',

  // DigiCamControl webserver configuration
  digiCamControl: {
    webserverEnabled: process.env.DIGICAMCONTROL_WEBSERVER_ENABLED === 'true',
    host: process.env.DIGICAMCONTROL_WEBSERVER_HOST || 'localhost',
    port: parseInt(process.env.DIGICAMCONTROL_WEBSERVER_PORT || '5513', 10),
    timeoutMs: parseInt(process.env.DIGICAMCONTROL_WEBSERVER_TIMEOUT_MS || '30000', 10),
    pollIntervalMs: parseInt(process.env.DIGICAMCONTROL_POLL_INTERVAL_MS || '500', 10),
  },

  midtrans: {
    serverKey: process.env[ENV_KEYS.MIDTRANS_SERVER_KEY] || '',
    clientKey: process.env[ENV_KEYS.MIDTRANS_CLIENT_KEY] || '',
    environment: (process.env[ENV_KEYS.MIDTRANS_ENVIRONMENT] || 'sandbox') as 'sandbox' | 'production',
  },

  whatsapp: {
    provider: (process.env[ENV_KEYS.WHATSAPP_PROVIDER] || 'fonnte') as 'fonnte' | 'wablas',
    apiKey: process.env[ENV_KEYS.WHATSAPP_API_KEY] || '',
  },

  // Sync settings for central analytics
  sync: {
    boothId: process.env.BOOTH_ID || 'booth-001',
    centralServerUrl: process.env.CENTRAL_SERVER_URL || '',
    centralServerApiKey: process.env.CENTRAL_SERVER_API_KEY || '',
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || '3600000', 10), // 1 hour default
  },

  isDevelopment: process.env[ENV_KEYS.NODE_ENV] === 'development',
  isProduction: process.env[ENV_KEYS.NODE_ENV] === 'production',
  devMode: process.env[ENV_KEYS.DEV_MODE] === 'true',
};

/**
 * Validate required environment variables
 */
export function validateEnv() {
  const missing: string[] = [];

  // Check critical environment variables in production
  if (env.isProduction) {
    if (!env.midtrans.serverKey) missing.push('MIDTRANS_SERVER_KEY');
    if (!env.midtrans.clientKey) missing.push('MIDTRANS_CLIENT_KEY');
  }

  if (missing.length > 0) {
    console.warn(`Warning: Missing environment variables: ${missing.join(', ')}`);
    console.warn('Some features may not work correctly.');
  }

  return missing.length === 0;
}

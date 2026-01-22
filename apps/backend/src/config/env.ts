import dotenv from 'dotenv';
import path from 'path';
import { ENV_KEYS } from '@photonic/config';

// Load environment variables
dotenv.config();

export const env = {
  nodeEnv: process.env[ENV_KEYS.NODE_ENV] || 'development',
  port: parseInt(process.env[ENV_KEYS.BACKEND_PORT] || '4000', 10),
  databasePath: process.env[ENV_KEYS.DATABASE_PATH] || './data/photobooth.db',
  bridgeServiceUrl: process.env[ENV_KEYS.BRIDGE_SERVICE_URL] || 'http://localhost:5000',

  midtrans: {
    serverKey: process.env[ENV_KEYS.MIDTRANS_SERVER_KEY] || '',
    clientKey: process.env[ENV_KEYS.MIDTRANS_CLIENT_KEY] || '',
    environment: (process.env[ENV_KEYS.MIDTRANS_ENVIRONMENT] || 'sandbox') as 'sandbox' | 'production',
  },

  whatsapp: {
    provider: (process.env[ENV_KEYS.WHATSAPP_PROVIDER] || 'fonnte') as 'fonnte' | 'wablas',
    apiKey: process.env[ENV_KEYS.WHATSAPP_API_KEY] || '',
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

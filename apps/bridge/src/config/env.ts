import dotenv from 'dotenv';
import { ENV_KEYS } from '@photonic/config';

// Load environment variables
dotenv.config();

export const env = {
  nodeEnv: process.env[ENV_KEYS.NODE_ENV] || 'development',
  port: parseInt(process.env[ENV_KEYS.BRIDGE_PORT] || '5000', 10),
  tempPhotoPath: process.env[ENV_KEYS.TEMP_PHOTO_PATH] || './temp',
  cameraTimeout: parseInt(process.env[ENV_KEYS.CAMERA_TIMEOUT] || '30000', 10),
  mockCamera: process.env[ENV_KEYS.MOCK_CAMERA] === 'true',
  useWebcam: process.env[ENV_KEYS.USE_WEBCAM] === 'true',

  isDevelopment: process.env[ENV_KEYS.NODE_ENV] === 'development',
  isProduction: process.env[ENV_KEYS.NODE_ENV] === 'production',
};

import { createApp } from './app';
import { env } from './config/env';
import { getCameraService } from './services/camera-service';
import { createLogger } from '@photonic/utils';
import fs from 'fs';
import path from 'path';

const logger = createLogger('bridge-server');

async function start() {
  try {
    logger.info('Starting Photonic Bridge Service...');

    // Create temp directory
    if (!fs.existsSync(env.tempPhotoPath)) {
      fs.mkdirSync(env.tempPhotoPath, { recursive: true });
      logger.info(`Created temp directory: ${env.tempPhotoPath}`);
    }

    // Initialize camera service
    logger.info('Initializing camera service...');
    const cameraService = getCameraService();

    try {
      await cameraService.initialize();
      logger.info('Camera service initialized successfully');
    } catch (error: any) {
      logger.warn('Camera initialization failed:', error.message);
      logger.warn('Service will continue in mock mode');
    }

    // Create Express app
    logger.info('Creating Express application...');
    const app = createApp();

    // Start server
    const server = app.listen(env.port, '0.0.0.0', () => {
      logger.info(`Server listening on http://localhost:${env.port}`);
      logger.info(`Environment: ${env.nodeEnv}`);
      logger.info(`Temp Photo Path: ${env.tempPhotoPath}`);
      logger.info(`Mock Camera: ${env.mockCamera ? 'Yes' : 'No'}`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        server.close(() => {
          logger.info('Express server closed');
        });

        await cameraService.disconnect();
        logger.info('Camera service disconnected');

        process.exit(0);
      } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection:', { reason, promise });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

start();

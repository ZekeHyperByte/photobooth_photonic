import { createApp } from './app';
import { initDatabase, closeDatabase } from './db';
import { env, validateEnv } from './config/env';
import { createLogger } from '@photonic/utils';
import { getSyncService } from './services/sync-service';
import { getCameraService } from './services/camera-service';
import { printService } from './services/print-service';
import fs from 'fs';
import path from 'path';

const logger = createLogger('server');

async function start() {
  try {
    logger.info('Starting Photonic Backend Server...');

    // Validate environment variables
    validateEnv();

    // Create data directories
    const dirs = ['data', 'data/photos', 'data/templates', 'data/processed', 'data/backups', 'logs', 'temp'];
    dirs.forEach((dir) => {
      const dirPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });

    // Initialize database
    logger.info('Initializing database...');
    initDatabase(env.databasePath);

    // Create Fastify app
    logger.info('Creating Fastify application...');
    const app = await createApp();

    // Start server
    await app.listen({
      port: env.port,
      host: '0.0.0.0',
    });

    logger.info(`Server listening on http://localhost:${env.port}`);
    logger.info(`Environment: ${env.nodeEnv}`);
    logger.info(`Database: ${env.databasePath}`);

    // Initialize camera service
    const cameraService = getCameraService();
    try {
      await cameraService.initialize();
      logger.info('Camera service initialized');
    } catch (error) {
      logger.warn('Camera service initialization failed, will retry on first capture');
    }

    // Start sync service (for central analytics)
    if (env.sync.centralServerUrl) {
      const syncService = getSyncService();
      syncService.start();
      logger.info(`Sync service started, booth ID: ${env.sync.boothId}`);
    }

    // Start print service
    await printService.start();
    logger.info('Print service started');

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop sync service
        const syncService = getSyncService();
        syncService.stop();
        logger.info('Sync service stopped');

        // Stop print service
        printService.stop();
        logger.info('Print service stopped');

        await app.close();
        logger.info('Fastify app closed');

        closeDatabase();
        logger.info('Database connection closed');

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

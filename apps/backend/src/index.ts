import { createApp } from './app';
import { initDatabase, closeDatabase } from './db';
import { env, validateEnv } from './config/env';
import { createLogger } from '@photonic/utils';
import fs from 'fs';
import path from 'path';

const logger = createLogger('server');

async function start() {
  try {
    logger.info('Starting Photonic Backend Server...');

    // Validate environment variables
    validateEnv();

    // Create data directories
    const dirs = ['data', 'data/photos', 'data/templates', 'data/processed', 'data/backups', 'logs'];
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
    logger.info(`Bridge Service: ${env.bridgeServiceUrl}`);

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
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

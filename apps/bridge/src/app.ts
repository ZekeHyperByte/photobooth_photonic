import express from 'express';
import cors from 'cors';
import { createLogger } from '@photonic/utils';
import cameraRoutes from './routes/camera';

const logger = createLogger('bridge-app');

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  // Health check
  app.get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'bridge',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Camera routes
  app.use('/camera', cameraRoutes);

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      name: 'Photonic Bridge Service',
      version: '0.1.0',
      status: 'running',
      description: 'DSLR camera control service',
    });
  });

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Request error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: err.message,
    });
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.method} ${req.path} not found`,
    });
  });

  return app;
}

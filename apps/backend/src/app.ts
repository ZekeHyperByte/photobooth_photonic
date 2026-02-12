import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { createLogger } from '@photonic/utils';
import { env } from './config/env';
import { packageRoutes } from './routes/packages';
import { sessionRoutes } from './routes/sessions';
import { paymentRoutes } from './routes/payment';
import { eventsRoutes } from './routes/events';
import { templateRoutes } from './routes/templates';
import { photoRoutes } from './routes/photos';
import { deliveryRoutes } from './routes/delivery';
import { adminRoutes } from './routes/admin';
import { codeRoutes } from './routes/codes';
import { filterRoutes } from './routes/filters';
import { cameraRoutes } from './routes/camera';
import { syncRoutes } from './routes/sync';
import path from 'path';
import fs from 'fs';

const logger = createLogger('app');

export async function createApp() {
  const app = Fastify({
    logger: false, // We use Winston instead
    trustProxy: true,
    bodyLimit: 50 * 1024 * 1024, // 50MB for photo uploads
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled for SSE
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow cross-origin image loading
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Serve static files (photos, templates, etc.)
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  await app.register(fastifyStatic, {
    root: dataDir,
    prefix: '/data/',
    decorateReply: false,
  });

  // Serve admin-web static files at /admin
  const adminWebDir = path.join(process.cwd(), '../admin-web/dist');
  if (fs.existsSync(adminWebDir)) {
    await app.register(fastifyStatic, {
      root: adminWebDir,
      prefix: '/admin/',
      decorateReply: false,
    });
    logger.info('Admin web panel enabled at /admin');
  }

  // Serve frame-designer static files at /frame-designer
  const frameDesignerDir = path.join(process.cwd(), '../frame-designer/dist');
  if (fs.existsSync(frameDesignerDir)) {
    await app.register(fastifyStatic, {
      root: frameDesignerDir,
      prefix: '/frame-designer/',
      decorateReply: false,
    });
    logger.info('Frame designer enabled at /frame-designer');
  }

  // Serve frontend SPA at root (must be registered LAST among static plugins)
  const frontendDir = path.join(process.cwd(), '../frontend/dist');
  if (fs.existsSync(frontendDir)) {
    await app.register(fastifyStatic, {
      root: frontendDir,
      prefix: '/',
      decorateReply: false,
    });
    logger.info('Frontend SPA served at /');
  }

  // Register routes
  await app.register(codeRoutes);
  await app.register(filterRoutes);
  await app.register(packageRoutes);
  await app.register(sessionRoutes);
  await app.register(paymentRoutes);
  await app.register(eventsRoutes);
  await app.register(templateRoutes);
  await app.register(photoRoutes);
  await app.register(deliveryRoutes);
  await app.register(adminRoutes);
  await app.register(cameraRoutes);
  await app.register(syncRoutes);

  // Health check endpoint
  app.get('/health', async () => {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: env.nodeEnv,
      uptime: process.uptime(),
    };
  });

  // Root endpoint: serve SPA index.html if frontend is built, otherwise API info
  app.get('/', async (request, reply) => {
    const indexPath = path.join(process.cwd(), '../frontend/dist/index.html');
    if (fs.existsSync(indexPath)) {
      return reply.sendFile('index.html', path.join(process.cwd(), '../frontend/dist'));
    }
    return {
      name: 'Photonic V0.1 API',
      version: '0.1.0',
      status: 'running',
      hint: 'Build frontend with: cd apps/frontend && pnpm build',
    };
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error('Request error:', {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    reply.status(error.statusCode || 500).send({
      error: error.name || 'Internal Server Error',
      message: error.message || 'An unexpected error occurred',
      statusCode: error.statusCode || 500,
    });
  });

  // Not found handler: SPA fallback for non-API routes
  const frontendIndex = path.join(process.cwd(), '../frontend/dist/index.html');
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/data/') || request.url.startsWith('/health')) {
      reply.status(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404,
      });
    } else if (fs.existsSync(frontendIndex)) {
      reply.sendFile('index.html', path.join(process.cwd(), '../frontend/dist'));
    } else {
      reply.status(404).send({
        error: 'Not Found',
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404,
      });
    }
  });

  return app;
}

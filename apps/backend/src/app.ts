import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { createLogger } from "@photonic/utils";
import { env } from "./config/env";
import { packageRoutes } from "./routes/packages";
import { sessionRoutes } from "./routes/sessions";
import { paymentRoutes } from "./routes/payment";
import { eventsRoutes } from "./routes/events";
import { templateRoutes } from "./routes/templates";
import { photoRoutes } from "./routes/photos";
import { deliveryRoutes } from "./routes/delivery";
import { adminRoutes } from "./routes/admin";
import { codeRoutes } from "./routes/codes";
import { filterRoutes } from "./routes/filters";
import { cameraRoutes } from "./routes/camera";
import { cameraHealthRoutes } from "./routes/camera-health";
import { selfTestRoutes } from "./routes/self-test";
import { adminCameraRoutes } from "./routes/admin-cameras";
import { syncRoutes } from "./routes/sync";
import path from "path";
import fs from "fs";

const logger = createLogger("app");

/**
 * Create and configure the Fastify application
 *
 * ROUTES MANIFEST:
 * =================
 * API Routes:
 *   GET    /health                          - Service health check
 *
 *   GET    /api/camera/health               - Camera health status (watchdog, battery, SD card)
 *   POST   /api/admin/self-test             - Run comprehensive system self-test
 *
 * Admin Camera Routes:
 *   GET    /api/admin/cameras               - List all discovered cameras
 *   POST   /api/admin/cameras/select        - Select active camera
 *   POST   /api/admin/cameras/standby       - Set standby camera for failover
 *
 * Photo Routes (with rate limiting on capture):
 *   POST   /api/photos/capture              - Capture photo from camera (rate limited: 1 per 3s per session)
 *   POST   /api/photos/upload               - Upload browser-captured photo
 *   POST   /api/photos/:photoId/process     - Process photo with template/filter
 *   POST   /api/photos/:photoId/preview-filter - Generate filter preview
 *   POST   /api/photos/composite-a3         - Create A3 composite
 *   GET    /api/photos/session/:sessionId   - Get all photos for a session
 *   GET    /api/photos/:photoId             - Get single photo details
 *   POST   /api/photos/collage              - Create photo collage
 *
 * Session Routes:
 *   POST   /api/sessions                    - Create new session
 *   GET    /api/sessions/:sessionId         - Get session details
 *   PATCH  /api/sessions/:sessionId         - Update session
 *   DELETE /api/sessions/:sessionId         - Delete session
 *
 * Package Routes:
 *   GET    /api/packages                    - List available packages
 *
 * Payment Routes:
 *   POST   /api/payments/create             - Create payment
 *   POST   /api/payments/verify             - Verify payment status
 *
 * Template Routes:
 *   GET    /api/templates                   - List templates
 *   GET    /api/templates/:id               - Get template details
 *
 * Filter Routes:
 *   GET    /api/filters                     - List filters
 *   POST   /api/filters/:id/preview         - Preview filter on photo
 *
 * Camera Routes:
 *   GET    /api/camera/status               - Get camera status
 *   GET    /api/camera/preview              - Get live view MJPEG stream
 *   POST   /api/camera/capture              - Trigger photo capture
 *
 * Admin Routes:
 *   GET    /api/admin/sessions              - List all sessions
 *   GET    /api/admin/photos                - List all photos
 *   GET    /api/admin/stats                 - Get booth statistics
 *
 * Delivery Routes:
 *   POST   /api/delivery/email              - Send photos via email
 *   POST   /api/delivery/qr                 - Generate QR code for download
 *
 * WebSocket:
 *   WS     /ws/camera                       - Real-time camera events
 *
 * Static Routes:
 *   /data/*                                 - Served photos and templates
 *   /admin/*                                - Admin web panel (if built)
 *   /frame-designer/*                       - Frame designer (if built)
 *   /                                       - Frontend SPA (if built)
 */
export async function createApp() {
  const app = Fastify({
    logger: false, // We use Winston instead
    trustProxy: true,
    bodyLimit: 50 * 1024 * 1024, // 50MB for photo uploads
  });

  // Register rate limit plugin (for capture endpoint)
  await app.register(rateLimit, {
    max: 100, // Default max per window
    timeWindow: "1 minute",
    errorResponseBuilder: (
      req: any,
      context: { after: string | number; max: number; ttl: number },
    ) => {
      return {
        success: false,
        error: "Too Many Requests",
        message: `Rate limit exceeded. Try again in ${context.after}`,
        retryAfter: context.after,
      };
    },
  });

  // Register plugins
  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(helmet, {
    contentSecurityPolicy: false, // Disabled for SSE
    crossOriginResourcePolicy: { policy: "cross-origin" }, // Allow cross-origin image loading
  });

  await app.register(multipart, {
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB
    },
  });

  // Serve static files (photos, templates, etc.)
  const dataDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  await app.register(fastifyStatic, {
    root: dataDir,
    prefix: "/data/",
    decorateReply: true, // Only this one needs sendFile for filter thumbnails
  });

  // Serve admin-web static files at /admin
  const adminWebDir = path.join(process.cwd(), "../admin-web/dist");
  if (fs.existsSync(adminWebDir)) {
    await app.register(fastifyStatic, {
      root: adminWebDir,
      prefix: "/admin/",
      decorateReply: false,
    });
    logger.info("Admin web panel enabled at /admin");
  }

  // Serve frame-designer static files at /frame-designer
  const frameDesignerDir = path.join(process.cwd(), "../frame-manager/dist");
  if (fs.existsSync(frameDesignerDir)) {
    await app.register(fastifyStatic, {
      root: frameDesignerDir,
      prefix: "/frame-designer/",
      decorateReply: false,
    });
    logger.info("Frame designer enabled at /frame-designer");
  }

  // Serve frontend SPA at root (must be registered LAST among static plugins)
  const frontendDir = path.join(process.cwd(), "../frontend/dist");
  if (fs.existsSync(frontendDir)) {
    await app.register(fastifyStatic, {
      root: frontendDir,
      prefix: "/",
      decorateReply: false, // Data static already decorated sendFile
    });
    logger.info("Frontend SPA served at /");
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
  await app.register(cameraHealthRoutes);
  await app.register(selfTestRoutes);
  await app.register(adminCameraRoutes);
  await app.register(syncRoutes);

  // Health check endpoint
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      environment: env.nodeEnv,
      uptime: process.uptime(),
    };
  });

  // Root endpoint: serve SPA index.html if frontend is built, otherwise API info
  app.get("/", async (request, reply) => {
    const indexPath = path.join(process.cwd(), "../frontend/dist/index.html");
    if (fs.existsSync(indexPath)) {
      const content = fs.readFileSync(indexPath, "utf-8");
      reply.header("Content-Type", "text/html");
      return reply.send(content);
    }
    return {
      name: "Photonic V0.1 API",
      version: "0.1.0",
      status: "running",
      routes: [
        "GET    /health",
        "GET    /api/camera/health",
        "POST   /api/admin/self-test",
        "GET    /api/admin/cameras",
        "POST   /api/admin/cameras/select",
        "POST   /api/admin/cameras/standby",
        "WS     /ws/camera",
      ],
      hint: "Build frontend with: cd apps/frontend && pnpm build",
    };
  });

  // Error handler
  app.setErrorHandler((error, request, reply) => {
    logger.error("Request error:", {
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    reply.status(error.statusCode || 500).send({
      error: error.name || "Internal Server Error",
      message: error.message || "An unexpected error occurred",
      statusCode: error.statusCode || 500,
    });
  });

  // Not found handler: SPA fallback for non-API routes
  const frontendIndex = path.join(process.cwd(), "../frontend/dist/index.html");
  app.setNotFoundHandler((request, reply) => {
    if (
      request.url.startsWith("/api/") ||
      request.url.startsWith("/data/") ||
      request.url.startsWith("/health") ||
      request.url.startsWith("/ws/")
    ) {
      reply.status(404).send({
        error: "Not Found",
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404,
      });
    } else if (fs.existsSync(frontendIndex)) {
      const content = fs.readFileSync(frontendIndex, "utf-8");
      reply.header("Content-Type", "text/html");
      return reply.send(content);
    } else {
      reply.status(404).send({
        error: "Not Found",
        message: `Route ${request.method} ${request.url} not found`,
        statusCode: 404,
      });
    }
  });

  return app;
}

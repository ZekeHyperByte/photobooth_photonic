/**
 * Backend Index - Server Entry Point
 *
 * ROUTES MANIFEST:
 * =================
 * Public API:
 *   GET    /health                          - Service health check
 *
 * Camera API:
 *   GET    /api/camera/health               - Camera health status
 *   GET    /api/camera/status               - Get camera status
 *   GET    /api/camera/preview              - Live view MJPEG stream
 *   POST   /api/camera/capture              - Trigger photo capture
 *
 * Admin API:
 *   POST   /api/admin/self-test             - Run comprehensive self-test
 *   GET    /api/admin/cameras               - List all cameras
 *   POST   /api/admin/cameras/select        - Select active camera
 *   POST   /api/admin/cameras/standby       - Set standby camera
 *   GET    /api/admin/sessions              - List all sessions
 *   GET    /api/admin/photos                - List all photos
 *   GET    /api/admin/stats                 - Get booth statistics
 *
 * Session API:
 *   POST   /api/sessions                    - Create new session
 *   GET    /api/sessions/:sessionId         - Get session details
 *   PATCH  /api/sessions/:sessionId         - Update session
 *   DELETE /api/sessions/:sessionId         - Delete session
 *
 * Photo API:
 *   POST   /api/photos/capture              - Capture photo (rate limited: 1 per 3s)
 *   POST   /api/photos/upload               - Upload browser-captured photo
 *   POST   /api/photos/:photoId/process     - Process photo
 *   POST   /api/photos/:photoId/preview-filter - Filter preview
 *   POST   /api/photos/composite-a3         - Create A3 composite
 *   GET    /api/photos/session/:sessionId   - Get session photos
 *   GET    /api/photos/:photoId             - Get photo details
 *   POST   /api/photos/collage              - Create collage
 *
 * WebSocket:
 *   WS     /ws/camera                       - Real-time camera events
 */

import { createApp } from "./app";
import { initDatabase, closeDatabase } from "./db";
import { env, validateEnv } from "./config/env";
import { createLogger } from "@photonic/utils";
import { getSyncService } from "./services/sync-service";
import { getCameraService } from "./services/camera-service";
import { printService } from "./services/print-service";
import {
  initializeCameraWebSocket,
  closeCameraWebSocket,
} from "./services/camera-websocket";
import { getCameraManager } from "./camera/camera-manager";
import type { CameraProvider } from "./camera/types";
import { getSessionPersistenceService } from "./services/session-persistence";
import fs from "fs";
import path from "path";
import type { FastifyInstance } from "fastify";

const logger = createLogger("server");

let app: FastifyInstance | null = null;
let serverStarted = false;

export interface ServerOptions {
  port?: number;
  host?: string;
}

export async function startServer(options: ServerOptions = {}): Promise<void> {
  if (serverStarted) {
    logger.warn("Server already started");
    return;
  }

  try {
    logger.info("Starting Photonic Backend Server...");

    // Validate environment variables
    validateEnv();

    // Create data directories
    const dirs = [
      "data",
      "data/photos",
      "data/templates",
      "data/processed",
      "data/backups",
      "logs",
      "temp",
    ];
    dirs.forEach((dir) => {
      const dirPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        logger.info(`Created directory: ${dir}`);
      }
    });

    // Initialize database (optional - app can work without it)
    try {
      logger.info("Initializing database...");
      initDatabase(env.databasePath);
      logger.info("Database initialized successfully");

      // Auto-run migrations
      try {
        const { autoMigrate } = await import("./db/auto-migrate");
        const migrationSuccess = await autoMigrate(env.databasePath);
        if (migrationSuccess) {
          logger.info("Database migrations completed");
        } else {
          logger.warn("Database migrations had issues, continuing anyway");
        }
      } catch (migrateError) {
        logger.warn("Auto-migration failed:", migrateError);
        logger.warn("Continuing without migration...");
      }
    } catch (dbError) {
      logger.warn(
        "Database initialization failed, continuing without database:",
        dbError,
      );
      logger.warn("Camera and other features will still work!");
    }

    // Create Fastify app
    logger.info("Creating Fastify application...");
    app = await createApp();

    // Start server
    const port = options.port || env.port;
    const host = options.host || "0.0.0.0";

    await app.listen({
      port,
      host,
    });

    serverStarted = true;

    logger.info(`Server listening on http://${host}:${port}`);
    logger.info(`Environment: ${env.nodeEnv}`);
    logger.info(`Database: ${env.databasePath} (optional)`);

    // Start periodic cleanup job (runs every 24 hours)
    try {
      const { getCleanupService } = await import("./services/cleanup-service");
      const cleanupService = getCleanupService();
      cleanupService.startPeriodicCleanup(24);
      logger.info("Periodic cleanup job started (24h interval)");
    } catch (error) {
      logger.error("Failed to start periodic cleanup job", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Initialize CameraManager
    const cameraManager = getCameraManager();
    let activeProvider: CameraProvider | null | undefined = null;
    try {
      await cameraManager.initialize();
      logger.info("CameraManager initialized");

      // Get the active provider from CameraManager
      activeProvider = cameraManager.getActiveProvider();
      if (activeProvider?.isConnected()) {
        logger.info("Camera connected and ready");
      } else {
        logger.info("CameraManager initialized, waiting for camera");
      }
    } catch (error) {
      logger.warn(
        "CameraManager initialization failed, will retry on first capture",
        error,
      );
    }

    // Initialize camera service using CameraManager's provider
    // This prevents double initialization of EDSDK
    // Convert null to undefined for type compatibility
    const cameraService = getCameraService(activeProvider || undefined);
    try {
      await cameraService.initialize();
      logger.info("Camera service initialized (using CameraManager provider)");
    } catch (error) {
      logger.warn(
        "Camera service initialization failed, will retry on first capture",
        error,
      );
    }

    // Initialize WebSocket server for camera events
    try {
      initializeCameraWebSocket(app);
      logger.info("Camera WebSocket server initialized on /ws/camera");
    } catch (wsError) {
      logger.warn("Failed to initialize WebSocket server:", wsError);
    }

    // Initialize session persistence service
    const persistenceService = getSessionPersistenceService();
    try {
      persistenceService.initialize();
      logger.info("Session persistence service initialized");

      // Attempt to recover any crashed sessions
      const recovered = await persistenceService.recoverCrashedSessions();
      if (recovered > 0) {
        logger.info(`Recovered ${recovered} crashed session(s)`);
      }
    } catch (error) {
      logger.warn("Session persistence initialization failed:", error);
    }

    // Start sync service (for central analytics)
    if (env.sync.centralServerUrl) {
      const syncService = getSyncService();
      syncService.start();
      logger.info(`Sync service started, booth ID: ${env.sync.boothId}`);
    }

    // Start print service
    await printService.start();
    logger.info("Print service started");

    // Subscribe camera events to WebSocket
    try {
      const wsServer = initializeCameraWebSocket(app);

      // Subscribe to camera events and forward to WebSocket
      cameraManager.on("camera:connected", (data) => {
        logger.info("WebSocket: Camera connected event", { model: data.model });
        wsServer.emitConnected(data.model || "Unknown", data.battery || 100);
      });

      cameraManager.on("camera:disconnected", (data) => {
        logger.warn("WebSocket: Camera disconnected event", {
          reason: data.reason,
        });
        wsServer.emitDisconnected(data.reason || "Camera disconnected");
      });

      cameraManager.on("camera:ready", (data) => {
        logger.info("WebSocket: Camera ready event");
        wsServer.emitReady(data);
      });

      cameraManager.on("camera:busy", (data) => {
        logger.debug("WebSocket: Camera busy event", {
          operation: data.operation,
        });
        wsServer.emitBusy(data.operation);
      });

      // NEW: Recovery events
      cameraManager.on("camera:recovery:started", (data) => {
        logger.info("WebSocket: Camera recovery started", {
          attempt: data.attempt,
        });
        wsServer.broadcast({
          type: "camera:recovery:started",
          data: {
            attempt: data.attempt,
            timestamp: data.timestamp,
            message: `Camera recovery attempt ${data.attempt} in progress...`,
          },
          timestamp: new Date().toISOString(),
        });
      });

      cameraManager.on("camera:recovery:success", (data) => {
        logger.info("WebSocket: Camera recovery successful");
        wsServer.broadcast({
          type: "camera:recovery:success",
          data: {
            cameraId: data.cameraId,
            timestamp: data.timestamp,
            message: "Camera recovered successfully!",
          },
          timestamp: new Date().toISOString(),
        });
      });

      cameraManager.on("camera:recovery:failed", (data) => {
        logger.error("WebSocket: Camera recovery failed", {
          error: data.error,
        });
        wsServer.broadcast({
          type: "camera:recovery:failed",
          data: {
            attempt: data.attempt,
            error: data.error,
            timestamp: data.timestamp,
            message: `Camera recovery failed: ${data.error}`,
          },
          timestamp: new Date().toISOString(),
        });
      });

      // NEW: Health status changes
      cameraManager.on("camera:status_changed", (data) => {
        logger.info("WebSocket: Camera status changed", {
          oldStatus: data.oldStatus,
          newStatus: data.newStatus,
        });
        wsServer.broadcast({
          type: "camera:status_changed",
          data: {
            oldStatus: data.oldStatus,
            newStatus: data.newStatus,
            timestamp: data.timestamp,
          },
          timestamp: new Date().toISOString(),
        });
      });

      // NEW: Warming up state
      cameraManager.on("warming_up", (data) => {
        logger.info("WebSocket: Camera warming up");
        wsServer.broadcast({
          type: "camera:warming_up",
          data: {
            timestamp: data.timestamp,
            message: "Camera is warming up, please wait...",
          },
          timestamp: new Date().toISOString(),
        });
      });

      // NEW: Camera available
      cameraManager.on("camera_available", (data) => {
        logger.info("WebSocket: Camera now available");
        wsServer.broadcast({
          type: "camera:available",
          data: {
            cameraId: data.cameraId,
            timestamp: data.timestamp,
          },
          timestamp: new Date().toISOString(),
        });
      });

      logger.info(
        "Camera events subscribed to WebSocket (with recovery/health events)",
      );
    } catch (error) {
      logger.warn("Failed to subscribe camera events to WebSocket:", error);
    }

    logger.info("=== Photonic Backend Server Started Successfully ===");
    logger.info("Available endpoints:");
    logger.info("  - GET  /health");
    logger.info("  - GET  /api/camera/health");
    logger.info("  - POST /api/admin/self-test");
    logger.info("  - GET  /api/admin/cameras");
    logger.info("  - WS   /ws/camera");
  } catch (error) {
    logger.error("Failed to start server:", error);
    throw error;
  }
}

export async function stopServer(): Promise<void> {
  if (!serverStarted || !app) {
    logger.warn("Server not started");
    return;
  }

  try {
    logger.info("Stopping Photonic Backend Server...");

    // Stop sync service
    const syncService = getSyncService();
    syncService.stop();
    logger.info("Sync service stopped");

    // Stop print service
    printService.stop();
    logger.info("Print service stopped");

    // Close camera service
    const cameraService = getCameraService();
    await cameraService.disconnect();
    logger.info("Camera service disconnected");

    // Close CameraManager
    const cameraManager = getCameraManager();
    await cameraManager.disconnect();
    logger.info("CameraManager disconnected");

    // Close WebSocket server
    closeCameraWebSocket();
    logger.info("WebSocket server closed");

    // Close session persistence
    const persistenceService = getSessionPersistenceService();
    persistenceService.close();
    logger.info("Session persistence closed");

    // Close Fastify app
    await app.close();
    logger.info("Fastify app closed");

    // Close database (optional - might not be initialized)
    try {
      closeDatabase();
      logger.info("Database connection closed");
    } catch (dbError) {
      logger.warn("Database was not initialized, skipping close");
    }

    serverStarted = false;
    app = null;

    logger.info("Server stopped successfully");
  } catch (error) {
    logger.error("Error during shutdown:", error);
    throw error;
  }
}

// Re-export services for Electron IPC
export { getCameraService } from "./services/camera-service";
export { getSyncService } from "./services/sync-service";
export { printService } from "./services/print-service";
export { getCameraManager } from "./camera/camera-manager";

// CLI mode (when run directly)
if (require.main === module) {
  // Handle graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, starting graceful shutdown...`);
    try {
      await stopServer();
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  };

  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));

  // Handle unhandled rejections
  process.on("unhandledRejection", (reason, promise) => {
    logger.error("Unhandled Rejection:", { reason, promise });
  });

  // Handle uncaught exceptions
  process.on("uncaughtException", (error) => {
    logger.error("Uncaught Exception:", error);
    process.exit(1);
  });

  // Start server
  startServer().catch((error) => {
    logger.error("Failed to start server:", error);
    process.exit(1);
  });
}

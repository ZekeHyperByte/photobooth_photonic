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

    // Initialize CameraManager for multi-camera support (must be first)
    const cameraManager = getCameraManager();
    let activeProvider: CameraProvider | null | undefined = null;
    try {
      await cameraManager.initialize();
      logger.info("CameraManager initialized with multi-camera support");

      // Log discovered cameras
      const cameras = cameraManager.getCameras();
      if (cameras.length > 0) {
        logger.info(
          `Discovered ${cameras.length} camera(s):`,
          cameras.map((c) => ({
            id: c.id,
            model: c.model,
            active: c.isActive,
          })),
        );
      }

      // Get the active provider from CameraManager
      activeProvider = cameraManager.getActiveProvider();
      logger.info("Got active camera provider from CameraManager");
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
      const cameraService = getCameraService();

      // Subscribe to camera events and forward to WebSocket
      cameraManager.on("camera:connected", (data) => {
        wsServer.emitConnected(data.model || "Unknown", data.battery || 100);
      });

      cameraManager.on("camera:disconnected", (data) => {
        wsServer.emitDisconnected(data.reason);
      });

      cameraManager.on("camera:ready", (data) => {
        wsServer.emitReady(data);
      });

      cameraManager.on("camera:busy", (data) => {
        wsServer.emitBusy(data.operation);
      });

      logger.info("Camera events subscribed to WebSocket");
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

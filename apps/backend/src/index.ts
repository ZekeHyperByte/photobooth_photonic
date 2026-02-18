import { createApp } from "./app";
import { initDatabase, closeDatabase } from "./db";
import { env, validateEnv } from "./config/env";
import { createLogger } from "@photonic/utils";
import { getSyncService } from "./services/sync-service";
import { getCameraService } from "./services/camera-service";
import { printService } from "./services/print-service";
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

    // Initialize database
    logger.info("Initializing database...");
    initDatabase(env.databasePath);

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
    logger.info(`Database: ${env.databasePath}`);

    // Initialize camera service
    const cameraService = getCameraService();
    try {
      await cameraService.initialize();
      logger.info("Camera service initialized");
    } catch (error) {
      logger.warn(
        "Camera service initialization failed, will retry on first capture",
      );
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

    // Close Fastify app
    await app.close();
    logger.info("Fastify app closed");

    // Close database
    closeDatabase();
    logger.info("Database connection closed");

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

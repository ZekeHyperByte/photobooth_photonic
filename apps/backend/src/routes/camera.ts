/**
 * Camera Routes
 * Handles camera capture, status, and configuration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getCameraService } from "../services/camera-service";
import { getPreviewStreamManager } from "../services/preview-stream-manager";
import { getCameraManager } from "../camera/camera-manager";
import { createLogger } from "@photonic/utils";
import { HTTP_STATUS } from "@photonic/config";
import type {
  CameraCaptureRequest,
  ConfigureCameraRequest,
} from "@photonic/types";

const logger = createLogger("camera-routes");

// Helper function for timestamped logging
function logWithTimestamp(
  level: "info" | "debug" | "error" | "warn",
  message: string,
  meta?: any,
) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [Preview]`;
  if (meta) {
    logger[level](`${prefix} ${message}`, meta);
  } else {
    logger[level](`${prefix} ${message}`);
  }
}

export async function cameraRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/camera/preview
   * MJPEG stream for live camera preview
   */
  fastify.get(
    "/api/camera/preview",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const PREVIEW_START_TIMEOUT_MS = 10000; // 10 seconds max
      const CLEANUP_DELAY_MS = 500; // 500ms cleanup delay

      try {
        const cameraService = getCameraService();

        if (!cameraService.isConnected()) {
          await cameraService.initialize();
        }

        const previewManager = getPreviewStreamManager();

        // CRITICAL FIX: Check for stale state from previous session
        // If there are existing clients, clean them up first
        if (previewManager.clientCount > 0) {
          logWithTimestamp(
            "info",
            `Detected ${previewManager.clientCount} stale clients, cleaning up...`,
          );

          await previewManager.stopAll();
          logWithTimestamp("debug", "Preview manager stopped");

          await cameraService.forceStopPreview().catch((err) => {
            logWithTimestamp("debug", "Force stop error (expected)", {
              error: err.message,
            });
          });
          logWithTimestamp("debug", "Camera preview force-stopped");

          logWithTimestamp(
            "info",
            `Waiting ${CLEANUP_DELAY_MS}ms for cleanup...`,
          );
          await new Promise((resolve) => setTimeout(resolve, CLEANUP_DELAY_MS));
          logWithTimestamp("info", "Cleanup complete, starting fresh preview");
        }

        // Set up response headers
        const res = reply.raw;
        res.writeHead(200, {
          "Content-Type": "multipart/x-mixed-replace; boundary=frame",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
          Pragma: "no-cache",
          Expires: "0",
        });

        // Add client
        const startTime = Date.now();
        const clientId = previewManager.addClient(res);
        logWithTimestamp("info", `New client added: ${clientId}`);

        // Set up timeout check
        let timeoutOccurred = false;
        let firstFrameReceived = false;
        const checkTimeout = setInterval(() => {
          const elapsed = Date.now() - startTime;
          if (
            elapsed > PREVIEW_START_TIMEOUT_MS &&
            !timeoutOccurred &&
            !firstFrameReceived
          ) {
            timeoutOccurred = true;
            logWithTimestamp(
              "error",
              `Timeout! Preview didn't start within ${PREVIEW_START_TIMEOUT_MS}ms`,
            );

            // Remove client and clean up
            previewManager.removeClient(clientId);
            clearInterval(checkTimeout);

            // Try to send error response if connection is still open
            try {
              if (!res.writableEnded) {
                res.write(
                  `--frame\r\nContent-Type: application/json\r\n\r\n${JSON.stringify({ error: "Preview timeout", message: "Preview failed to start within 10 seconds" })}\r\n`,
                );
                res.end();
              }
            } catch (e) {
              // Connection already closed
            }
          }
        }, 1000);

        // CRITICAL FIX: Listen for first frame event to clear timeout
        // This prevents the 10-second timeout from closing an active stream
        const onFirstFrame = () => {
          if (!firstFrameReceived) {
            firstFrameReceived = true;
            logWithTimestamp(
              "info",
              `First frame received from preview manager, clearing timeout for client ${clientId}`,
            );
          }
        };
        previewManager.once("firstFrame", onFirstFrame);

        // Clean up when client disconnects
        request.raw.on("close", () => {
          clearInterval(checkTimeout);
          previewManager.removeListener("firstFrame", onFirstFrame);
          previewManager.removeClient(clientId);
          logWithTimestamp("info", `Client ${clientId} disconnected`);
        });

        // Prevent Fastify from sending its own response
        reply.hijack();
      } catch (error: any) {
        logWithTimestamp("error", "Preview stream failed", {
          error: error.message,
        });
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Preview Failed",
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /api/camera/capture
   * Trigger photo capture
   */
  fastify.post(
    "/api/camera/capture",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionId, sequenceNumber } =
          request.body as CameraCaptureRequest;

        if (!sessionId || !sequenceNumber) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            error: "Bad Request",
            message: "sessionId and sequenceNumber are required",
          });
        }

        logger.info("Capture request:", { sessionId, sequenceNumber });

        const cameraService = getCameraService();

        // Initialize camera if not already done
        if (!cameraService.isConnected()) {
          await cameraService.initialize();
        }

        // Stop preview stream before capture
        const previewManager = getPreviewStreamManager();
        const hadPreviewClients = previewManager.clientCount > 0;
        if (hadPreviewClients) {
          logger.info("Stopping preview stream for capture...");
          await previewManager.stopAll();
        }

        try {
          // Capture photo
          const result = await cameraService.capturePhoto(
            sessionId,
            sequenceNumber,
          );

          // Restart preview stream after successful capture
          if (hadPreviewClients) {
            logger.info("Restarting preview stream after capture...");
            try {
              await cameraService.startPreviewStream();
              logger.info("Preview stream restarted successfully");
            } catch (restartError) {
              logger.warn("Failed to restart preview stream:", restartError);
            }
          }

          return reply.code(HTTP_STATUS.OK).send({
            success: true,
            data: {
              filePath: result.imagePath,
              metadata: result.metadata,
            },
          });
        } catch (captureError: any) {
          // Even on capture failure, try to restart preview
          if (hadPreviewClients) {
            logger.info("Capture failed, attempting to restart preview stream...");
            try {
              await cameraService.startPreviewStream();
              logger.info("Preview stream restarted after failed capture");
            } catch (restartError) {
              logger.warn("Failed to restart preview after failed capture:", restartError);
            }
          }
          throw captureError;
        }
      } catch (error: any) {
        logger.error("Capture failed:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Capture Failed",
          message: error.message,
        });
      }
    },
  );

  /**
   * GET /api/camera/status
   * Get camera status and settings
   */
  fastify.get(
    "/api/camera/status",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraService = getCameraService();
        const status = await cameraService.getStatus();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: status,
        });
      } catch (error: any) {
        logger.error("Failed to get camera status:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Status Error",
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /api/camera/configure
   * Configure camera settings
   */
  fastify.post(
    "/api/camera/configure",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const settings = request.body as ConfigureCameraRequest;

        logger.info("Configure request:", settings);

        const cameraService = getCameraService();

        if (!cameraService.isConnected()) {
          await cameraService.initialize();
        }

        const result = await cameraService.configure(settings);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            settings: result,
          },
        });
      } catch (error: any) {
        logger.error("Configuration failed:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Configuration Failed",
          message: error.message,
        });
      }
    },
  );

  /**
   * GET /api/camera/detect
   * Detect available cameras
   */
  fastify.get(
    "/api/camera/detect",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraService = getCameraService();

        if (!cameraService.isConnected()) {
          await cameraService.initialize();
        }

        const status = await cameraService.getStatus();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            cameras: status.connected
              ? [
                  {
                    model: status.model,
                    port: "usb",
                    abilities: ["capture", "preview"],
                  },
                ]
              : [],
          },
        });
      } catch (error: any) {
        logger.error("Detection failed:", error);
        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            cameras: [],
          },
        });
      }
    },
  );

  /**
   * GET /api/camera/mode
   * Get current camera mode based on actual camera provider
   */
  fastify.get(
    "/api/camera/mode",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraManager = getCameraManager();
        const activeCameraId = cameraManager.getActiveCameraId();

        if (!activeCameraId) {
          return reply.code(HTTP_STATUS.OK).send({
            success: true,
            data: { mode: "mock" },
          });
        }

        // Extract provider type from camera ID (format: "providerType-timestamp")
        // Handle multi-part provider names like "python-gphoto2-1234567890"
        const parts = activeCameraId.split("-");
        const providerType =
          parts.length > 2 && parts[0] === "python" && parts[1] === "gphoto2"
            ? "python-gphoto2"
            : parts[0];

        // Map provider types to modes
        const mode = [
          "edsdk",
          "edsdk-v2",
          "gphoto2",
          "python-gphoto2",
        ].includes(providerType)
          ? "dslr"
          : providerType === "webcam"
            ? "webcam"
            : "mock";

        logger.info("Camera mode detected", { providerType, mode });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: { mode },
        });
      } catch (error: any) {
        logger.error("Failed to get camera mode:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Mode Error",
          message: error.message,
        });
      }
    },
  );

  /**
   * GET /api/camera/diagnostics
   * Get camera diagnostic information including available configs
   */
  fastify.get(
    "/api/camera/diagnostics",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraService = getCameraService();

        if (!cameraService.isConnected()) {
          return reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
            success: false,
            message: "Camera not connected",
          });
        }

        const mode = (cameraService as any).cameraMode;
        const availableConfigs = (cameraService as any).availableConfigs || [];
        const liveViewConfigName = (cameraService as any).liveViewConfigName;

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            mode,
            availableConfigs,
            liveViewConfigName,
            connected: cameraService.isConnected(),
          },
        });
      } catch (error: any) {
        logger.error("Failed to get camera diagnostics:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Diagnostics Error",
          message: error.message,
        });
      }
    },
  );

  logger.info("Camera routes registered");
}

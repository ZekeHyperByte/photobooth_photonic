/**
 * Camera Health Routes
 *
 * GET /api/camera/health - Comprehensive camera health status
 * POST /api/camera/reset - Manual camera reset (admin)
 * GET /api/camera/health/detailed - Detailed health with statistics
 *
 * Note: Simplified for single python-gphoto2 camera deployment.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getCameraService } from "../services/camera-service";
import { getCameraManager } from "../camera/camera-manager";
import { ExtendedCameraStatusResponse } from "../camera/types";
import { createLogger } from "@photonic/utils";
import { HTTP_STATUS } from "@photonic/config";

const logger = createLogger("camera-health");

/**
 * Camera health response type
 */
export interface CameraHealthResponse {
  connected: boolean;
  model: string | null;
  serialNumber: string | null;
  battery: number | null;
  batteryLow: boolean;
  status: "healthy" | "degraded" | "failed" | "warming_up";
  sdCard: {
    present: boolean;
    writeable: boolean;
    freeSpaceMB: number | null;
  };
  liveView: {
    active: boolean;
    fps: number;
    droppedFrames: number;
  };
  capture: {
    locked: boolean;
    captureCount: number;
    lastCaptureAt: string | null;
    lastError: string | null;
  };
  watchdog: {
    status: "healthy" | "reconnecting" | "failed";
    reconnectAttempts: number;
    lastReconnectAt: string | null;
  };
  sdk: {
    version: string;
    dllPath: string;
  };
  health?: {
    consecutiveFailures: number;
    totalCaptures: number;
    successfulCaptures: number;
    failedCaptures: number;
    captureSuccessRate: number;
    isRecovering: boolean;
    lastResetAt: string | null;
  };
}

export async function cameraHealthRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/camera/health
   * Get comprehensive camera health status
   */
  fastify.get(
    "/api/camera/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      // Add timeout to prevent hanging
      const TIMEOUT_MS = 10000; // 10 second timeout

      try {
        const cameraService = getCameraService();
        const cameraManager = getCameraManager();

        // Get status without settings - much faster
        const statusPromise = cameraService.getStatus();
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(
            () => reject(new Error("Camera health check timeout")),
            TIMEOUT_MS,
          );
        });

        const status = (await Promise.race([
          statusPromise,
          timeoutPromise,
        ])) as ExtendedCameraStatusResponse;

        // Get health stats from CameraManager
        const healthStats = cameraManager.getHealth();

        const health: CameraHealthResponse = {
          connected: status.connected,
          model: status.model || null,
          serialNumber: status.serialNumber || null,
          battery: status.battery ?? null,
          batteryLow: (status.battery ?? 100) < 20,
          status: healthStats.status,
          sdCard: status.sdCard || {
            present: false,
            writeable: false,
            freeSpaceMB: null,
          },
          liveView: status.liveView || {
            active: false,
            fps: 0,
            droppedFrames: 0,
          },
          capture: status.capture || {
            locked: false,
            captureCount: healthStats.totalCaptures,
            lastCaptureAt: healthStats.lastCaptureAt,
            lastError: healthStats.lastError,
          },
          watchdog: status.watchdog || {
            status: healthStats.status === "healthy" ? "healthy" : "failed",
            reconnectAttempts: 0,
            lastReconnectAt: healthStats.lastResetAt,
          },
          sdk: status.sdk || {
            version: "python-gphoto2",
            dllPath: "N/A",
          },
          health: {
            consecutiveFailures: healthStats.consecutiveFailures,
            totalCaptures: healthStats.totalCaptures,
            successfulCaptures: healthStats.successfulCaptures,
            failedCaptures: healthStats.failedCaptures,
            captureSuccessRate: healthStats.captureSuccessRate,
            isRecovering: healthStats.isRecovering,
            lastResetAt: healthStats.lastResetAt,
          },
        };

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: health,
        });
      } catch (error: any) {
        logger.error("Failed to get camera health:", error);

        // Get health stats even if camera is not responding
        const cameraManager = getCameraManager();
        const healthStats = cameraManager.getHealth();

        // Check if it's a timeout
        if (error.message === "Camera health check timeout") {
          return reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
            success: false,
            error: "Health Check Timeout",
            message:
              "Camera is not responding. The camera may be busy or disconnected.",
            data: {
              connected: false,
              status: healthStats.status,
              health: {
                consecutiveFailures: healthStats.consecutiveFailures,
                isRecovering: healthStats.isRecovering,
                lastError: healthStats.lastError,
              },
            },
          });
        }

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Health Check Failed",
          message: error.message,
          data: {
            connected: false,
            status: "failed",
            health: healthStats,
          },
        });
      }
    },
  );

  /**
   * POST /api/camera/reset
   * Manual camera reset (admin endpoint)
   */
  fastify.post(
    "/api/camera/reset",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      logger.info("Manual camera reset requested via API");

      try {
        const cameraManager = getCameraManager();

        // Disconnect and reinitialize
        await cameraManager.disconnect();
        await cameraManager.initialize();

        // Check if camera is now connected
        const status = await cameraManager.getStatus();

        if (status.connected) {
          logger.info("Manual camera reset successful");
          return reply.code(HTTP_STATUS.OK).send({
            success: true,
            message: "Camera reset successful",
            timestamp: new Date().toISOString(),
          });
        } else {
          logger.warn("Manual camera reset failed - camera not connected");
          return reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
            success: false,
            message: "Camera reset failed - camera not connected",
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error: any) {
        logger.error("Error during manual camera reset:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Reset Failed",
          message: error.message || "Unknown error during camera reset",
        });
      }
    },
  );

  /**
   * GET /api/camera/health/detailed
   * Get detailed health with extended statistics
   */
  fastify.get(
    "/api/camera/health/detailed",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraService = getCameraService();
        const cameraManager = getCameraManager();

        const [status, extendedStatus] = await Promise.all([
          cameraService.getStatus(),
          cameraService.getExtendedStatus(),
        ]);

        const healthStats = cameraManager.getHealth();

        const detailedHealth = {
          // Basic info
          connected: status.connected,
          status: healthStats.status,
          model: status.model,
          battery: status.battery,

          // Single camera info
          camera: {
            id: "python-gphoto2",
            model: status.model || "Canon DSLR",
            port: "USB",
            isActive: status.connected,
          },
          activeCameraId: status.connected ? "python-gphoto2" : null,
          standbyCameraId: null,

          // Health statistics
          health: healthStats,

          // Provider-specific data
          provider: extendedStatus.providerMetadata,
          sdCard: extendedStatus.sdCard,
          liveView: extendedStatus.liveView,
          capture: extendedStatus.capture,
          watchdog: extendedStatus.watchdog,
          sdk: extendedStatus.sdk,

          // System info
          timestamp: new Date().toISOString(),
          platform: "linux",
        };

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: detailedHealth,
        });
      } catch (error: any) {
        logger.error("Failed to get detailed camera health:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Detailed Health Check Failed",
          message: error.message,
        });
      }
    },
  );

  logger.info("Camera health routes registered (with reset endpoint)");
}

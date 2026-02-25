/**
 * Camera Health Routes
 *
 * GET /api/camera/health - Comprehensive camera health status
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getCameraService } from "../services/camera-service";
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
}

export async function cameraHealthRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/camera/health
   * Get comprehensive camera health status
   */
  fastify.get(
    "/api/camera/health",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraService = getCameraService();
        const status =
          (await cameraService.getStatus()) as ExtendedCameraStatusResponse;

        const health: CameraHealthResponse = {
          connected: status.connected,
          model: status.model || null,
          serialNumber: status.serialNumber || null,
          battery: status.battery ?? null,
          batteryLow: (status.battery ?? 100) < 20,
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
            captureCount: 0,
            lastCaptureAt: null,
            lastError: null,
          },
          watchdog: status.watchdog || {
            status: "healthy",
            reconnectAttempts: 0,
            lastReconnectAt: null,
          },
          sdk: status.sdk || {
            version: "unknown",
            dllPath: "unknown",
          },
        };

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: health,
        });
      } catch (error: any) {
        logger.error("Failed to get camera health:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Health Check Failed",
          message: error.message,
        });
      }
    },
  );

  logger.info("Camera health routes registered");
}

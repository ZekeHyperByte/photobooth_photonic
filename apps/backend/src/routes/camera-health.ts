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
      // Add timeout to prevent hanging
      const TIMEOUT_MS = 10000; // 10 second timeout
      
      try {
        const cameraService = getCameraService();
        
        // Get status without settings - much faster
        // This only checks battery and basic connectivity
        const statusPromise = cameraService.getStatus({ includeSettings: false });
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Camera health check timeout')), TIMEOUT_MS);
        });
        
        const status = await Promise.race([statusPromise, timeoutPromise]) as ExtendedCameraStatusResponse;

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
        
        // Check if it's a timeout
        if (error.message === 'Camera health check timeout') {
          return reply.code(HTTP_STATUS.SERVICE_UNAVAILABLE).send({
            success: false,
            error: "Health Check Timeout",
            message: "Camera is not responding. The camera may be busy or disconnected.",
          });
        }
        
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

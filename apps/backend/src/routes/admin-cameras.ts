/**
 * Admin Camera Routes
 *
 * GET    /api/admin/cameras        - Get camera status
 * POST   /api/admin/cameras/select - No-op (single camera only)
 * POST   /api/admin/cameras/standby - No-op (no failover support)
 *
 * Note: This is simplified for single python-gphoto2 camera deployment.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getCameraManager } from "../camera/camera-manager";
import { createLogger } from "@photonic/utils";
import { HTTP_STATUS } from "@photonic/config";

const logger = createLogger("admin-cameras");

export async function adminCameraRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/cameras
   * Get camera status (simplified for single camera)
   */
  fastify.get(
    "/api/admin/cameras",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraManager = getCameraManager();
        const status = await cameraManager.getStatus();

        logger.info("Admin: Retrieved camera status", {
          connected: status.connected,
          model: status.model,
        });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            cameras: [
              {
                id: "python-gphoto2",
                model: status.model || "Canon DSLR",
                port: "USB",
                isActive: status.connected,
                isStandby: false,
              },
            ],
            activeCameraId: status.connected ? "python-gphoto2" : null,
            standbyCameraId: null,
          },
        });
      } catch (error: any) {
        logger.error("Admin: Failed to get camera status:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Failed to get camera status",
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /api/admin/cameras/select
   * No-op: Only one camera supported
   */
  fastify.post(
    "/api/admin/cameras/select",
    async (request: FastifyRequest, reply: FastifyReply) => {
      logger.info("Admin: Camera select called (no-op for single camera)");

      return reply.code(HTTP_STATUS.OK).send({
        success: true,
        message: "Single camera mode - selection not required",
        data: {
          cameraId: "python-gphoto2",
        },
      });
    },
  );

  /**
   * POST /api/admin/cameras/standby
   * No-op: No failover support
   */
  fastify.post(
    "/api/admin/cameras/standby",
    async (request: FastifyRequest, reply: FastifyReply) => {
      logger.info("Admin: Camera standby called (no-op for single camera)");

      return reply.code(HTTP_STATUS.OK).send({
        success: true,
        message: "No failover support in single camera mode",
        data: {
          cameraId: null,
        },
      });
    },
  );

  logger.info("Admin camera routes registered");
}

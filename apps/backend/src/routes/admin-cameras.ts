/**
 * Admin Camera Routes
 *
 * GET    /api/admin/cameras        - List all discovered cameras
 * POST   /api/admin/cameras/select - Select active camera
 * POST   /api/admin/cameras/standby - Set standby camera for failover
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { getCameraManager } from "../camera/camera-manager";
import { createLogger } from "@photonic/utils";
import { HTTP_STATUS } from "@photonic/config";

const logger = createLogger("admin-cameras");

export async function adminCameraRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/cameras
   * List all discovered cameras with their status
   */
  fastify.get(
    "/api/admin/cameras",
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraManager = getCameraManager();

        // Ensure manager is initialized
        if (!cameraManager.getActiveCameraId()) {
          await cameraManager.initialize();
        }

        const cameras = cameraManager.getCameras();
        const activeCameraId = cameraManager.getActiveCameraId();
        const standbyCameraId = cameraManager.getStandbyCameraId();

        logger.info("Admin: Listed cameras", {
          count: cameras.length,
          activeCameraId,
          standbyCameraId,
        });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            cameras,
            activeCameraId,
            standbyCameraId,
          },
        });
      } catch (error: any) {
        logger.error("Admin: Failed to list cameras:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Failed to list cameras",
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /api/admin/cameras/select
   * Select a camera as the active camera
   *
   * Body: { cameraId: string }
   */
  fastify.post(
    "/api/admin/cameras/select",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as { cameraId: string };

        if (!body.cameraId) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            error: "Missing cameraId",
            message: "cameraId is required in request body",
          });
        }

        const cameraManager = getCameraManager();
        await cameraManager.selectCamera(body.cameraId);

        const camera = cameraManager.getCamera(body.cameraId);

        logger.info("Admin: Camera selected", {
          cameraId: body.cameraId,
          model: camera?.model,
        });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: `Camera ${camera?.model || body.cameraId} is now active`,
          data: {
            cameraId: body.cameraId,
            camera,
          },
        });
      } catch (error: any) {
        logger.error("Admin: Failed to select camera:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Failed to select camera",
          message: error.message,
        });
      }
    },
  );

  /**
   * POST /api/admin/cameras/standby
   * Set a camera as standby for failover
   *
   * Body: { cameraId: string }
   */
  fastify.post(
    "/api/admin/cameras/standby",
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as { cameraId: string };

        if (!body.cameraId) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            error: "Missing cameraId",
            message: "cameraId is required in request body",
          });
        }

        const cameraManager = getCameraManager();
        await cameraManager.setStandby(body.cameraId);

        const camera = cameraManager.getCamera(body.cameraId);

        logger.info("Admin: Camera set as standby", {
          cameraId: body.cameraId,
          model: camera?.model,
        });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: `Camera ${camera?.model || body.cameraId} is now standby`,
          data: {
            cameraId: body.cameraId,
            camera,
          },
        });
      } catch (error: any) {
        logger.error("Admin: Failed to set standby camera:", error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: "Failed to set standby camera",
          message: error.message,
        });
      }
    },
  );

  logger.info("Admin camera routes registered");
}

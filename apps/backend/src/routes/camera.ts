import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { getCameraService } from '../services/camera-service';
import { getPreviewStreamManager } from '../services/preview-stream-manager';
import { createLogger } from '@photonic/utils';
import { HTTP_STATUS } from '@photonic/config';
import type {
  CameraCaptureRequest,
  ConfigureCameraRequest,
} from '@photonic/types';

const logger = createLogger('camera-routes');

/**
 * Camera Routes
 * Handles camera capture, status, and configuration
 */
export async function cameraRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/camera/preview
   * MJPEG stream for live camera preview
   */
  fastify.get(
    '/api/camera/preview',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraService = getCameraService();

        if (!cameraService.isConnected()) {
          await cameraService.initialize();
        }

        const res = reply.raw;
        res.writeHead(200, {
          'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
          'Pragma': 'no-cache',
          'Expires': '0',
        });

        const previewManager = getPreviewStreamManager();
        const clientId = previewManager.addClient(res);

        request.raw.on('close', () => {
          previewManager.removeClient(clientId);
        });

        // Prevent Fastify from sending its own response
        reply.hijack();
      } catch (error: any) {
        logger.error('Preview stream failed:', error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Preview Failed',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/camera/capture
   * Trigger photo capture
   */
  fastify.post(
    '/api/camera/capture',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { sessionId, sequenceNumber } = request.body as CameraCaptureRequest;

        if (!sessionId || !sequenceNumber) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            error: 'Bad Request',
            message: 'sessionId and sequenceNumber are required',
          });
        }

        logger.info('Capture request:', { sessionId, sequenceNumber });

        const cameraService = getCameraService();

        // Initialize camera if not already done
        if (!cameraService.isConnected()) {
          await cameraService.initialize();
        }

        // Stop preview stream before capture (gphoto2 is single-threaded over USB)
        const previewManager = getPreviewStreamManager();
        if (previewManager.clientCount > 0) {
          logger.info('Stopping preview stream for capture...');
          await previewManager.stopAll();
        }

        // Capture photo
        const result = await cameraService.capturePhoto(sessionId, sequenceNumber);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            filePath: result.imagePath,
            metadata: result.metadata,
          },
        });
      } catch (error: any) {
        logger.error('Capture failed:', error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Capture Failed',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/camera/status
   * Get camera status and settings
   */
  fastify.get(
    '/api/camera/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraService = getCameraService();
        const status = await cameraService.getStatus();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: status,
        });
      } catch (error: any) {
        logger.error('Failed to get camera status:', error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Status Error',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/camera/configure
   * Configure camera settings
   */
  fastify.post(
    '/api/camera/configure',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const settings = request.body as ConfigureCameraRequest;

        logger.info('Configure request:', settings);

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
        logger.error('Configuration failed:', error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Configuration Failed',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/camera/detect
   * Detect available cameras
   */
  fastify.get(
    '/api/camera/detect',
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
                    port: 'usb',
                    abilities: ['capture', 'preview'],
                  },
                ]
              : [],
          },
        });
      } catch (error: any) {
        logger.error('Detection failed:', error);
        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            cameras: [],
          },
        });
      }
    }
  );

  /**
   * GET /api/camera/mode
   * Get current camera mode
   */
  fastify.get(
    '/api/camera/mode',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const cameraService = getCameraService();
        const mode = (cameraService as any).cameraMode;

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: { mode },
        });
      } catch (error: any) {
        logger.error('Failed to get camera mode:', error);
        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Mode Error',
          message: error.message,
        });
      }
    }
  );

  logger.info('Camera routes registered');
}

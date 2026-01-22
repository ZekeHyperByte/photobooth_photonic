import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { whatsappService } from '../services/whatsapp-service';
import { printService } from '../services/print-service';
import { ENDPOINTS, HTTP_STATUS, MESSAGES } from '@photonic/config';
import { logger } from '@photonic/utils';
import type {
  SendWhatsAppRequest,
  QueuePrintRequest,
} from '@photonic/types';

/**
 * Delivery Routes
 * Handles WhatsApp delivery and print queue management
 */
export async function deliveryRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/delivery/whatsapp/:photoId
   * Send photo via WhatsApp
   */
  fastify.post(
    `${ENDPOINTS.DELIVERY_WHATSAPP}/:photoId`,
    async (
      request: FastifyRequest<{ Params: { photoId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { photoId } = request.params;
        const body = request.body as SendWhatsAppRequest;

        logger.info('Sending photo via WhatsApp', {
          photoId,
          phoneNumber: body.phoneNumber,
        });

        // Get photo path from database
        const { db } = await import('../db');
        const { photos } = await import('../db/schema');
        const { eq } = await import('drizzle-orm');

        const photo = await db.query.photos.findFirst({
          where: eq(photos.id, photoId),
        });

        if (!photo) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Photo not found',
          });
        }

        // Use processed photo if available, otherwise original
        const photoPath = photo.processedPath || photo.originalPath;

        // Send via WhatsApp
        const deliveryId = await whatsappService.sendPhoto(
          body.phoneNumber,
          photoPath,
          'Thank you for using our photobooth! Here is your photo 📸'
        );

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: MESSAGES.SUCCESS.WHATSAPP_SENT,
          data: {
            deliveryId,
            phoneNumber: body.phoneNumber,
          },
        });
      } catch (error) {
        logger.error('Failed to send WhatsApp message', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to send WhatsApp message',
        });
      }
    }
  );

  /**
   * POST /api/delivery/whatsapp/session
   * Send all photos from a session via WhatsApp (batch)
   */
  fastify.post(
    `${ENDPOINTS.DELIVERY_WHATSAPP}/session`,
    async (
      request: FastifyRequest<{
        Body: {
          sessionId: string;
          phoneNumber: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { sessionId, phoneNumber } = request.body;

        logger.info('Sending session photos via WhatsApp', {
          sessionId,
          phoneNumber,
        });

        // Verify session exists
        const { db } = await import('../db');
        const { sessions } = await import('../db/schema');
        const { eq } = await import('drizzle-orm');

        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
        });

        if (!session) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Session not found',
          });
        }

        // Send all session photos
        const deliveryIds = await whatsappService.sendSessionPhotos(
          sessionId,
          phoneNumber
        );

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: `Successfully sent ${deliveryIds.length} photos via WhatsApp`,
          data: {
            deliveryIds,
            totalPhotos: deliveryIds.length,
            phoneNumber,
          },
        });
      } catch (error) {
        logger.error('Failed to send session photos via WhatsApp', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to send session photos via WhatsApp',
        });
      }
    }
  );

  /**
   * GET /api/delivery/whatsapp/:deliveryId/status
   * Check WhatsApp delivery status
   */
  fastify.get(
    `${ENDPOINTS.DELIVERY_WHATSAPP}/:deliveryId/status`,
    async (
      request: FastifyRequest<{ Params: { deliveryId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { deliveryId } = request.params;

        logger.info('Checking WhatsApp delivery status', { deliveryId });

        const status = await whatsappService.checkStatus(deliveryId);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: status,
        });
      } catch (error) {
        logger.error('Failed to check delivery status', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Delivery not found',
          });
        }

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to check delivery status',
        });
      }
    }
  );

  /**
   * POST /api/delivery/print/:photoId
   * Queue photo for printing
   */
  fastify.post(
    `${ENDPOINTS.DELIVERY_PRINT}/:photoId`,
    async (
      request: FastifyRequest<{ Params: { photoId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { photoId } = request.params;
        const body = (request.body as QueuePrintRequest) || {};

        logger.info('Queueing photo for print', { photoId, copies: body.copies });

        const printJobId = await printService.queuePrint(photoId, body);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: MESSAGES.SUCCESS.PRINT_QUEUED,
          data: {
            printJobId,
            copies: body.copies || 1,
          },
        });
      } catch (error) {
        logger.error('Failed to queue print job', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Photo not found',
          });
        }

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to queue print job',
        });
      }
    }
  );

  /**
   * GET /api/delivery/print/:printJobId/status
   * Check print job status
   */
  fastify.get(
    `${ENDPOINTS.DELIVERY_PRINT}/:printJobId/status`,
    async (
      request: FastifyRequest<{ Params: { printJobId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { printJobId } = request.params;

        logger.info('Checking print job status', { printJobId });

        const status = await printService.getPrintStatus(printJobId);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: status,
        });
      } catch (error) {
        logger.error('Failed to check print job status', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Print job not found',
          });
        }

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to check print job status',
        });
      }
    }
  );

  /**
   * GET /api/delivery/print/pending
   * Get all pending print jobs (for Electron app)
   */
  fastify.get(
    `${ENDPOINTS.DELIVERY_PRINT}/pending`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Fetching pending print jobs');

        const pendingJobs = await printService.getPendingJobs();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: pendingJobs,
        });
      } catch (error) {
        logger.error('Failed to fetch pending print jobs', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch pending print jobs',
        });
      }
    }
  );

  /**
   * PUT /api/delivery/print/:printJobId/status
   * Update print job status (for Electron app)
   */
  fastify.put(
    `${ENDPOINTS.DELIVERY_PRINT}/:printJobId/status`,
    async (
      request: FastifyRequest<{ Params: { printJobId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { printJobId } = request.params;
        const body = request.body as {
          status: 'printing' | 'completed' | 'failed';
          error?: string;
        };

        logger.info('Updating print job status', {
          printJobId,
          status: body.status,
        });

        await printService.updatePrintStatus(
          printJobId,
          body.status,
          body.error
        );

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Print job status updated',
        });
      } catch (error) {
        logger.error('Failed to update print job status', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Print job not found',
          });
        }

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to update print job status',
        });
      }
    }
  );

  /**
   * DELETE /api/delivery/print/:printJobId
   * Cancel a print job
   */
  fastify.delete(
    `${ENDPOINTS.DELIVERY_PRINT}/:printJobId`,
    async (
      request: FastifyRequest<{ Params: { printJobId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { printJobId } = request.params;

        logger.info('Cancelling print job', { printJobId });

        await printService.cancelPrint(printJobId);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Print job cancelled',
        });
      } catch (error) {
        logger.error('Failed to cancel print job', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: error.message,
          });
        }

        return reply.code(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to cancel print job',
        });
      }
    }
  );

  logger.info('Delivery routes registered');
}

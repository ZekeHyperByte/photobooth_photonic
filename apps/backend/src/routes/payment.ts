import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { paymentService } from '../services/payment-service';
import { createPaymentSchema, verifyPaymentSchema } from '@photonic/utils';
import { ENDPOINTS, HTTP_STATUS, MESSAGES } from '@photonic/config';
import { logger } from '@photonic/utils';
import type {
  CreatePaymentRequest,
  VerifyPaymentRequest,
} from '@photonic/types';

/**
 * Payment Routes
 * Handles payment creation, verification, status checks, and webhooks
 */
export async function paymentRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/payment/create
   * Create a new QRIS payment
   */
  fastify.post(
    ENDPOINTS.PAYMENT_CREATE,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Validate request body
        const validatedData = createPaymentSchema.parse(request.body);

        logger.info('Creating payment', { sessionId: validatedData.sessionId });

        // Create payment
        const result = await paymentService.createPayment(
          validatedData as CreatePaymentRequest
        );

        return reply.code(HTTP_STATUS.CREATED).send({
          success: true,
          message: MESSAGES.SUCCESS.PAYMENT_CREATED,
          data: result,
        });
      } catch (error) {
        logger.error('Failed to create payment', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: error.message,
          });
        }

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to create payment',
        });
      }
    }
  );

  /**
   * POST /api/payment/verify
   * Verify payment status
   */
  fastify.post(
    ENDPOINTS.PAYMENT_VERIFY,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Validate request body
        const validatedData = verifyPaymentSchema.parse(request.body);

        logger.info('Verifying payment', { orderId: validatedData.orderId });

        // Verify payment
        const result = await paymentService.verifyPayment(
          validatedData as VerifyPaymentRequest
        );

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: result.paid
            ? MESSAGES.SUCCESS.PAYMENT_VERIFIED
            : 'Payment not completed yet',
          data: result,
        });
      } catch (error) {
        logger.error('Failed to verify payment', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: MESSAGES.ERROR.PAYMENT_NOT_FOUND,
          });
        }

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to verify payment',
        });
      }
    }
  );

  /**
   * GET /api/payment/status/:orderId
   * Get payment status
   */
  fastify.get(
    `${ENDPOINTS.PAYMENT_STATUS}/:orderId`,
    async (
      request: FastifyRequest<{ Params: { orderId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { orderId } = request.params;

        logger.info('Getting payment status', { orderId });

        // Get payment status
        const result = await paymentService.getPaymentStatus(orderId);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: result,
        });
      } catch (error) {
        logger.error('Failed to get payment status', {
          error: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error && error.message.includes('not found')) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: MESSAGES.ERROR.PAYMENT_NOT_FOUND,
          });
        }

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to get payment status',
        });
      }
    }
  );

  /**
   * POST /api/payment/webhook
   * Handle Midtrans webhook notifications
   */
  fastify.post(
    '/api/payment/webhook',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Received webhook notification', {
          body: request.body,
        });

        // Handle webhook
        await paymentService.handleWebhook(request.body);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Webhook processed successfully',
        });
      } catch (error) {
        logger.error('Failed to process webhook', {
          error: error instanceof Error ? error.message : String(error),
          body: request.body,
        });

        // Return 200 to Midtrans even on error to prevent retries
        return reply.code(HTTP_STATUS.OK).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to process webhook',
        });
      }
    }
  );

  logger.info('Payment routes registered');
}

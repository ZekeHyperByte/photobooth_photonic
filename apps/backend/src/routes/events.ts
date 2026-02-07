import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { paymentEvents } from '../services/payment-events';
import { ENDPOINTS } from '@photonic/config';
import { logger } from '@photonic/utils';
import type { PaymentUpdateEvent } from '@photonic/types';

/**
 * Events Routes
 * Handles Server-Sent Events (SSE) for real-time updates
 */
export async function eventsRoutes(fastify: FastifyInstance) {
  /**
   * GET /events/payment/:orderId
   * SSE stream for payment status updates
   */
  fastify.get(
    `${ENDPOINTS.EVENTS_PAYMENT}/:orderId`,
    async (
      request: FastifyRequest<{ Params: { orderId: string } }>,
      reply: FastifyReply
    ) => {
      const { orderId } = request.params;

      logger.info('SSE connection opened', { orderId });

      // Set SSE headers
      reply.raw.setHeader('Content-Type', 'text/event-stream');
      reply.raw.setHeader('Cache-Control', 'no-cache');
      reply.raw.setHeader('Connection', 'keep-alive');
      reply.raw.setHeader('Access-Control-Allow-Origin', '*');

      // Send initial connection event
      reply.raw.write(
        `data: ${JSON.stringify({ event: 'connected', orderId })}\n\n`
      );

      // Payment update handler
      const handlePaymentUpdate = (event: PaymentUpdateEvent) => {
        logger.info('Sending payment update via SSE', {
          orderId,
          status: event.data.status,
        });

        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);

        // Close connection if payment is completed
        if (event.data.paid || event.data.status === 'failed') {
          logger.info('Closing SSE connection', {
            orderId,
            status: event.data.status,
          });

          // Send close event
          reply.raw.write(`data: ${JSON.stringify({ event: 'close' })}\n\n`);

          // Unsubscribe and close
          paymentEvents.offPaymentUpdate(orderId, handlePaymentUpdate);
          reply.raw.end();
        }
      };

      // Subscribe to payment updates
      paymentEvents.onPaymentUpdate(orderId, handlePaymentUpdate);

      // Handle client disconnect
      request.raw.on('close', () => {
        logger.info('SSE connection closed by client', { orderId });
        paymentEvents.offPaymentUpdate(orderId, handlePaymentUpdate);
      });

      // Keep connection alive with heartbeat
      const heartbeat = setInterval(() => {
        reply.raw.write(`: heartbeat\n\n`);
      }, 30000); // Every 30 seconds

      // Clean up heartbeat on close
      request.raw.on('close', () => {
        clearInterval(heartbeat);
      });
    }
  );

  logger.info('Events routes registered');
}

import { EventEmitter } from 'events';
import type { PaymentUpdateEvent } from '@photonic/types';
import { logger } from '@photonic/utils';

/**
 * Payment Event Emitter
 * Manages SSE connections for payment status updates
 */
class PaymentEventEmitter extends EventEmitter {
  constructor() {
    super();
    logger.info('PaymentEventEmitter initialized');
  }

  /**
   * Emit payment update event
   */
  emitPaymentUpdate(orderId: string, data: PaymentUpdateEvent['data']) {
    const event: PaymentUpdateEvent = {
      event: 'payment_update',
      data,
    };

    logger.info('Emitting payment update', { orderId, status: data.status });
    this.emit(`payment:${orderId}`, event);
  }

  /**
   * Subscribe to payment updates for a specific order
   */
  onPaymentUpdate(
    orderId: string,
    callback: (event: PaymentUpdateEvent) => void
  ) {
    logger.info('Client subscribed to payment updates', { orderId });
    this.on(`payment:${orderId}`, callback);
  }

  /**
   * Unsubscribe from payment updates
   */
  offPaymentUpdate(
    orderId: string,
    callback: (event: PaymentUpdateEvent) => void
  ) {
    logger.info('Client unsubscribed from payment updates', { orderId });
    this.off(`payment:${orderId}`, callback);
  }
}

// Export singleton instance
export const paymentEvents = new PaymentEventEmitter();

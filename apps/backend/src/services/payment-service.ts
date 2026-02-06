/**
 * Payment Service
 * High-level service that uses the configured payment provider
 * Supports: mock, midtrans, and future providers
 */

import { nanoid } from 'nanoid';
import { db } from '../db';
import { transactions, sessions, packages } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@photonic/utils';
import { paymentEvents } from './payment-events';
import { paymentManager, getPaymentProvider } from './payment';
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  PaymentStatusResponse,
} from '@photonic/types';

/**
 * Payment Service Class
 */
export class PaymentService {
  /**
   * Initialize the payment service
   */
  async initialize(): Promise<void> {
    await paymentManager.initialize();
    logger.info('PaymentService initialized', {
      provider: paymentManager.getProviderName(),
      isRealPayment: paymentManager.isRealPayment(),
    });
  }

  /**
   * Create a new payment
   */
  async createPayment(
    request: CreatePaymentRequest
  ): Promise<CreatePaymentResponse> {
    try {
      logger.info('Creating payment', { sessionId: request.sessionId });

      // Get session details
      const session = await db.query.sessions.findFirst({
        where: eq(sessions.id, request.sessionId),
      });

      if (!session) {
        throw new Error('Session not found');
      }

      // Get package details
      const pkg = await db.query.packages.findFirst({
        where: eq(packages.id, session.packageId),
      });

      if (!pkg) {
        throw new Error('Package not found');
      }

      // Generate unique order ID
      const orderId = `ORDER-${Date.now()}-${nanoid(6)}`;
      const transactionId = nanoid();

      // Get the configured payment provider
      const provider = getPaymentProvider();

      // Create payment with provider
      const result = await provider.createPayment({
        orderId,
        amount: pkg.price,
        itemName: pkg.name,
        itemId: pkg.id,
        expiryMinutes: 15,
      });

      // Store transaction in database
      await db.insert(transactions).values({
        id: transactionId,
        sessionId: request.sessionId,
        orderId,
        grossAmount: pkg.price,
        paymentType: 'qris',
        transactionStatus: 'pending',
        qrCodeUrl: result.qrCodeUrl || null,
        qrString: result.qrString || null,
        expiryTime: new Date(result.expiryTime),
        provider: paymentManager.getProviderName(),
        providerResponse: result.rawResponse as any,
      });

      // Update session status
      await db
        .update(sessions)
        .set({ status: 'awaiting_payment' })
        .where(eq(sessions.id, request.sessionId));

      logger.info('Payment created successfully', { 
        orderId, 
        transactionId,
        provider: paymentManager.getProviderName(),
      });

      return {
        success: true,
        orderId,
        transactionId,
        qrCodeUrl: result.qrCodeUrl || '',
        qrString: result.qrString || '',
        amount: pkg.price,
        expiryTime: result.expiryTime,
      };
    } catch (error) {
      logger.error('Failed to create payment', {
        error: error instanceof Error ? error.message : String(error),
        sessionId: request.sessionId,
      });
      throw error;
    }
  }

  /**
   * Verify payment status
   */
  async verifyPayment(
    request: VerifyPaymentRequest
  ): Promise<VerifyPaymentResponse> {
    try {
      logger.info('Verifying payment', { orderId: request.orderId });

      // Get transaction from database
      const transaction = await db.query.transactions.findFirst({
        where: eq(transactions.orderId, request.orderId),
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Use provider to verify
      const provider = getPaymentProvider();
      const result = await provider.verifyPayment(request.orderId);

      // Update transaction in database
      await db
        .update(transactions)
        .set({
          transactionStatus: result.status,
          paymentTime: result.paymentTime ? new Date(result.paymentTime) : null,
          providerResponse: result.rawResponse as any,
        })
        .where(eq(transactions.orderId, request.orderId));

      // Update session status if paid
      if (result.isPaid) {
        await db
          .update(sessions)
          .set({ status: 'paid' })
          .where(eq(sessions.id, transaction.sessionId));
      }

      logger.info('Payment verified', {
        orderId: request.orderId,
        status: result.status,
        isPaid: result.isPaid,
      });

      // Emit payment update event
      paymentEvents.emitPaymentUpdate(request.orderId, {
        orderId: request.orderId,
        status: result.status,
        isPaid: result.isPaid,
        amount: transaction.grossAmount,
      });

      return {
        success: true,
        isPaid: result.isPaid,
        transactionStatus: result.status,
        paymentTime: result.paymentTime,
      };
    } catch (error) {
      logger.error('Failed to verify payment', {
        error: error instanceof Error ? error.message : String(error),
        orderId: request.orderId,
      });
      throw error;
    }
  }

  /**
   * Get payment status
   */
  async getPaymentStatus(orderId: string): Promise<PaymentStatusResponse> {
    try {
      logger.info('Getting payment status', { orderId });

      // Get transaction from database
      const transaction = await db.query.transactions.findFirst({
        where: eq(transactions.orderId, orderId),
      });

      if (!transaction) {
        throw new Error('Transaction not found');
      }

      // Use provider to get status
      const provider = getPaymentProvider();
      const result = await provider.getPaymentStatus(orderId);

      return {
        orderId,
        status: result.status,
        amount: result.amount,
        isPaid: result.isPaid,
        isExpired: result.isExpired,
        paymentTime: result.paymentTime,
        expiryTime: result.expiryTime,
      };
    } catch (error) {
      logger.error('Failed to get payment status', {
        error: error instanceof Error ? error.message : String(error),
        orderId,
      });
      throw error;
    }
  }

  /**
   * Handle webhook notification
   */
  async handleWebhook(notification: any): Promise<void> {
    try {
      logger.info('Received webhook notification', {
        orderId: notification.order_id,
        provider: paymentManager.getProviderName(),
      });

      const provider = getPaymentProvider();

      if (!provider.handleWebhook) {
        logger.warn('Provider does not support webhooks');
        return;
      }

      const result = await provider.handleWebhook(notification);

      if (!result) {
        logger.info('Webhook processed but no action needed');
        return;
      }

      // Get transaction from database
      const transaction = await db.query.transactions.findFirst({
        where: eq(transactions.orderId, result.orderId),
      });

      if (!transaction) {
        logger.warn('Transaction not found for webhook', { orderId: result.orderId });
        return;
      }

      // Update transaction status
      const isPaid = result.status === 'paid';
      
      await db
        .update(transactions)
        .set({
          transactionStatus: result.status,
          paymentTime: isPaid ? new Date() : null,
          providerResponse: notification as any,
        })
        .where(eq(transactions.orderId, result.orderId));

      // Update session status if paid
      if (isPaid) {
        await db
          .update(sessions)
          .set({ status: 'paid' })
          .where(eq(sessions.id, transaction.sessionId));
      }

      // Emit payment update event
      paymentEvents.emitPaymentUpdate(result.orderId, {
        orderId: result.orderId,
        status: result.status,
        isPaid,
        amount: transaction.grossAmount,
      });

      logger.info('Webhook processed successfully', {
        orderId: result.orderId,
        status: result.status,
        isPaid,
      });
    } catch (error) {
      logger.error('Failed to handle webhook', {
        error: error instanceof Error ? error.message : String(error),
        notification,
      });
      throw error;
    }
  }

  /**
   * Get current payment provider info
   */
  getProviderInfo() {
    return {
      name: paymentManager.getProviderName(),
      isRealPayment: paymentManager.isRealPayment(),
      isInitialized: paymentManager.isInitialized(),
    };
  }
}

// Export singleton instance
export const paymentService = new PaymentService();

import { Snap, CoreApi } from 'midtrans-client';
import { nanoid } from 'nanoid';
import { db } from '../db';
import { transactions, sessions, packages } from '../db/schema';
import { eq } from 'drizzle-orm';
import { env } from '../config/env';
import { logger } from '@photonic/utils';
import { paymentEvents } from './payment-events';
import type {
  CreatePaymentRequest,
  CreatePaymentResponse,
  VerifyPaymentRequest,
  VerifyPaymentResponse,
  PaymentStatusResponse,
} from '@photonic/types';

/**
 * Payment Service
 * Handles Midtrans QRIS payment integration
 */
export class PaymentService {
  private snap: Snap;
  private coreApi: CoreApi;

  constructor() {
    // Initialize Midtrans Snap API (for QRIS)
    this.snap = new Snap({
      isProduction: env.midtrans.environment === 'production',
      serverKey: env.midtrans.serverKey,
      clientKey: env.midtrans.clientKey,
    });

    // Initialize Midtrans Core API (for status check)
    this.coreApi = new CoreApi({
      isProduction: env.midtrans.environment === 'production',
      serverKey: env.midtrans.serverKey,
      clientKey: env.midtrans.clientKey,
    });

    logger.info('PaymentService initialized', {
      environment: env.midtrans.environment,
    });
  }

  /**
   * Create QRIS payment
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

      // Calculate expiry time (15 minutes from now)
      const expiryTime = new Date(Date.now() + 15 * 60 * 1000);

      // DEV_MODE: Return mock payment without calling Midtrans
      if (env.devMode) {
        logger.info('DEV_MODE: Creating mock payment (bypassing Midtrans)', { orderId });

        // Store mock transaction in database
        await db.insert(transactions).values({
          id: transactionId,
          sessionId: request.sessionId,
          orderId,
          grossAmount: pkg.price,
          paymentType: 'qris',
          transactionStatus: 'success',
          qrCodeUrl: 'https://api.sandbox.midtrans.com/v2/qris/mock-qr-code',
          qrString: 'MOCK_QR_STRING_DEV_MODE',
          paymentTime: new Date(),
          expiryTime,
          midtransResponse: { mock: true, message: 'DEV_MODE enabled' } as any,
        });

        // Update session status to 'paid'
        await db
          .update(sessions)
          .set({ status: 'paid' })
          .where(eq(sessions.id, request.sessionId));

        logger.info('Mock payment created successfully', { orderId, transactionId });

        return {
          transaction: {
            id: transactionId,
            sessionId: request.sessionId,
            orderId,
            grossAmount: pkg.price,
            paymentType: 'qris',
            transactionStatus: 'success',
            qrCodeUrl: 'https://api.sandbox.midtrans.com/v2/qris/mock-qr-code',
            qrString: 'MOCK_QR_STRING_DEV_MODE',
            transactionTime: new Date(),
            paymentTime: new Date(),
            expiryTime,
            midtransResponse: { mock: true, message: 'DEV_MODE enabled' },
          },
          qrCodeUrl: 'https://api.sandbox.midtrans.com/v2/qris/mock-qr-code',
          qrString: 'MOCK_QR_STRING_DEV_MODE',
        };
      }

      // Prepare Midtrans transaction data
      const parameter = {
        transaction_details: {
          order_id: orderId,
          gross_amount: pkg.price,
        },
        item_details: [
          {
            id: pkg.id,
            price: pkg.price,
            quantity: 1,
            name: pkg.name,
          },
        ],
        enabled_payments: ['qris'],
        qris: {
          acquirer: 'gopay', // Can be changed to other acquirers
        },
        custom_expiry: {
          expiry_duration: 15,
          unit: 'minute',
        },
      };

      logger.info('Calling Midtrans createTransaction', { orderId });

      // Create transaction with Midtrans
      const midtransResponse = await this.snap.createTransaction(parameter);

      logger.info('Midtrans transaction created', {
        orderId,
        transactionId: midtransResponse.token,
      });

      // Store transaction in database
      await db.insert(transactions).values({
        id: transactionId,
        sessionId: request.sessionId,
        orderId,
        grossAmount: pkg.price,
        paymentType: 'qris',
        transactionStatus: 'pending',
        qrCodeUrl: midtransResponse.redirect_url || null,
        qrString: midtransResponse.qr_string || null,
        expiryTime,
        midtransResponse: midtransResponse as any,
      });

      // Update session status
      await db
        .update(sessions)
        .set({ status: 'awaiting_payment' })
        .where(eq(sessions.id, request.sessionId));

      logger.info('Payment created successfully', { orderId, transactionId });

      return {
        success: true,
        orderId,
        transactionId,
        qrCodeUrl: midtransResponse.redirect_url || '',
        qrString: midtransResponse.qr_string || '',
        amount: pkg.price,
        expiryTime: expiryTime.toISOString(),
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

      // DEV_MODE: Return success immediately
      if (env.devMode) {
        logger.info('DEV_MODE: Payment automatically verified as paid', {
          orderId: request.orderId,
        });

        // Emit payment update event
        paymentEvents.emitPaymentUpdate(request.orderId, {
          orderId: request.orderId,
          status: 'paid',
          isPaid: true,
          amount: transaction.grossAmount,
        });

        return {
          success: true,
          isPaid: true,
          transactionStatus: 'paid',
          paymentTime: new Date().toISOString(),
        };
      }

      // Check status from Midtrans
      const statusResponse = await this.coreApi.transaction.status(
        request.orderId
      );

      logger.info('Midtrans status check', {
        orderId: request.orderId,
        status: statusResponse.transaction_status,
      });

      // Map Midtrans status to our status
      let transactionStatus: string = transaction.transactionStatus;
      let isPaid = false;

      if (statusResponse.transaction_status === 'settlement') {
        transactionStatus = 'paid';
        isPaid = true;
      } else if (statusResponse.transaction_status === 'pending') {
        transactionStatus = 'pending';
      } else if (
        statusResponse.transaction_status === 'deny' ||
        statusResponse.transaction_status === 'cancel' ||
        statusResponse.transaction_status === 'expire'
      ) {
        transactionStatus = 'failed';
      }

      // Update transaction in database
      await db
        .update(transactions)
        .set({
          transactionStatus,
          paymentTime: isPaid ? new Date() : null,
          midtransResponse: statusResponse as any,
        })
        .where(eq(transactions.orderId, request.orderId));

      // Update session status if paid
      if (isPaid) {
        await db
          .update(sessions)
          .set({ status: 'paid' })
          .where(eq(sessions.id, transaction.sessionId));
      }

      logger.info('Payment verified', {
        orderId: request.orderId,
        status: transactionStatus,
        isPaid,
      });

      // Emit payment update event
      paymentEvents.emitPaymentUpdate(request.orderId, {
        orderId: request.orderId,
        status: transactionStatus,
        isPaid,
        amount: transaction.grossAmount,
      });

      return {
        success: true,
        isPaid,
        transactionStatus,
        paymentTime: isPaid ? new Date().toISOString() : undefined,
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

      // DEV_MODE: Always return paid status
      if (env.devMode) {
        return {
          orderId,
          status: 'paid',
          amount: transaction.grossAmount,
          isPaid: true,
          isExpired: false,
          paymentTime: transaction.paymentTime?.toISOString() || new Date().toISOString(),
          expiryTime: transaction.expiryTime?.toISOString(),
        };
      }

      const isPaid = transaction.transactionStatus === 'paid';
      const isExpired =
        transaction.expiryTime && transaction.expiryTime < new Date();

      return {
        orderId,
        status: transaction.transactionStatus,
        amount: transaction.grossAmount,
        isPaid,
        isExpired: isExpired || false,
        paymentTime: transaction.paymentTime?.toISOString(),
        expiryTime: transaction.expiryTime?.toISOString(),
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
   * Handle Midtrans webhook notification
   */
  async handleWebhook(notification: any): Promise<void> {
    try {
      logger.info('Handling webhook notification', {
        orderId: notification.order_id,
        transactionStatus: notification.transaction_status,
      });

      // Verify notification authenticity
      const statusResponse = await this.coreApi.transaction.notification(
        notification
      );

      const orderId = statusResponse.order_id;
      const transactionStatus = statusResponse.transaction_status;
      const fraudStatus = statusResponse.fraud_status;

      logger.info('Webhook verified', {
        orderId,
        transactionStatus,
        fraudStatus,
      });

      // Get transaction from database
      const transaction = await db.query.transactions.findFirst({
        where: eq(transactions.orderId, orderId),
      });

      if (!transaction) {
        logger.warn('Transaction not found for webhook', { orderId });
        return;
      }

      // Update transaction based on status
      let newStatus = transaction.transactionStatus;
      let isPaid = false;

      if (transactionStatus === 'capture') {
        if (fraudStatus === 'accept') {
          newStatus = 'paid';
          isPaid = true;
        }
      } else if (transactionStatus === 'settlement') {
        newStatus = 'paid';
        isPaid = true;
      } else if (
        transactionStatus === 'cancel' ||
        transactionStatus === 'deny' ||
        transactionStatus === 'expire'
      ) {
        newStatus = 'failed';
      } else if (transactionStatus === 'pending') {
        newStatus = 'pending';
      }

      // Update transaction in database
      await db
        .update(transactions)
        .set({
          transactionStatus: newStatus,
          paymentTime: isPaid ? new Date() : null,
          midtransResponse: statusResponse as any,
        })
        .where(eq(transactions.orderId, orderId));

      // Update session status if paid
      if (isPaid) {
        await db
          .update(sessions)
          .set({ status: 'paid' })
          .where(eq(sessions.id, transaction.sessionId));
      }

      // Emit payment update event
      paymentEvents.emitPaymentUpdate(orderId, {
        orderId,
        status: newStatus,
        isPaid,
        amount: transaction.grossAmount,
      });

      logger.info('Webhook processed successfully', {
        orderId,
        newStatus,
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
}

// Export singleton instance
export const paymentService = new PaymentService();

/**
 * Midtrans Payment Provider
 * QRIS payment integration via Midtrans
 */

import { Snap, CoreApi } from 'midtrans-client';
import { logger } from '@photonic/utils';
import { env } from '../../config/env';
import type {
  PaymentProvider,
  CreatePaymentParams,
  CreatePaymentResult,
  VerifyPaymentResult,
  PaymentStatusResult,
  WebhookPayload,
} from './provider.interface';

export class MidtransProvider implements PaymentProvider {
  readonly name = 'midtrans';
  readonly isAvailable: boolean;
  
  private snap: Snap | null = null;
  private coreApi: CoreApi | null = null;
  
  constructor() {
    // Check if credentials are configured
    this.isAvailable = !!(
      env.payment.midtrans?.serverKey && 
      env.payment.midtrans?.clientKey
    );
    
    if (!this.isAvailable) {
      logger.warn('MidtransProvider: Not available - missing credentials');
    }
  }
  
  async initialize(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Midtrans provider not available - missing credentials');
    }
    
    const isProduction = env.payment.midtrans?.environment === 'production';
    
    this.snap = new Snap({
      isProduction,
      serverKey: env.payment.midtrans!.serverKey,
      clientKey: env.payment.midtrans!.clientKey,
    });
    
    this.coreApi = new CoreApi({
      isProduction,
      serverKey: env.payment.midtrans!.serverKey,
      clientKey: env.payment.midtrans!.clientKey,
    });
    
    logger.info('MidtransProvider initialized', {
      environment: isProduction ? 'production' : 'sandbox',
    });
  }
  
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    if (!this.snap) {
      throw new Error('Midtrans not initialized');
    }
    
    try {
      logger.info('Midtrans: Creating payment', { orderId: params.orderId });
      
      const parameter = {
        transaction_details: {
          order_id: params.orderId,
          gross_amount: params.amount,
        },
        item_details: [
          {
            id: params.itemId,
            price: params.amount,
            quantity: 1,
            name: params.itemName,
          },
        ],
        customer_details: params.customerDetails ? {
          first_name: params.customerDetails.firstName,
          last_name: params.customerDetails.lastName,
          email: params.customerDetails.email,
          phone: params.customerDetails.phone,
        } : undefined,
        enabled_payments: ['qris'],
        qris: {
          acquirer: 'gopay',
        },
        custom_expiry: {
          expiry_duration: params.expiryMinutes || 15,
          unit: 'minute',
        },
      };
      
      const response = await this.snap.createTransaction(parameter);
      
      logger.info('Midtrans: Payment created', { 
        orderId: params.orderId,
        token: response.token,
      });
      
      return {
        success: true,
        orderId: params.orderId,
        transactionId: response.token,
        amount: params.amount,
        qrCodeUrl: response.redirect_url || '',
        qrString: response.qr_string || '',
        expiryTime: new Date(Date.now() + (params.expiryMinutes || 15) * 60 * 1000).toISOString(),
        rawResponse: response,
      };
    } catch (error) {
      logger.error('Midtrans: Failed to create payment', { error, orderId: params.orderId });
      throw error;
    }
  }
  
  async verifyPayment(orderId: string): Promise<VerifyPaymentResult> {
    if (!this.coreApi) {
      throw new Error('Midtrans not initialized');
    }
    
    try {
      logger.info('Midtrans: Verifying payment', { orderId });
      
      const statusResponse = await this.coreApi.transaction.status(orderId);
      
      const transactionStatus = statusResponse.transaction_status;
      let status: VerifyPaymentResult['status'] = 'pending';
      let isPaid = false;
      
      if (transactionStatus === 'settlement') {
        status = 'paid';
        isPaid = true;
      } else if (transactionStatus === 'pending') {
        status = 'pending';
      } else if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
        status = 'failed';
      }
      
      logger.info('Midtrans: Payment verified', { orderId, status, isPaid });
      
      return {
        success: true,
        orderId,
        isPaid,
        status,
        paymentTime: isPaid ? new Date().toISOString() : undefined,
        amount: statusResponse.gross_amount,
        rawResponse: statusResponse,
      };
    } catch (error) {
      logger.error('Midtrans: Failed to verify payment', { error, orderId });
      throw error;
    }
  }
  
  async getPaymentStatus(orderId: string): Promise<PaymentStatusResult> {
    // Use verifyPayment internally
    const result = await this.verifyPayment(orderId);
    
    return {
      orderId: result.orderId,
      status: result.status,
      isPaid: result.isPaid,
      isExpired: result.status === 'expired',
      amount: result.amount || 0,
      paymentTime: result.paymentTime,
    };
  }
  
  async handleWebhook(payload: any): Promise<WebhookPayload | null> {
    if (!this.coreApi) {
      throw new Error('Midtrans not initialized');
    }
    
    try {
      logger.info('Midtrans: Handling webhook', { 
        orderId: payload.order_id,
        status: payload.transaction_status,
      });
      
      // Verify notification authenticity
      const statusResponse = await this.coreApi.transaction.notification(payload);
      
      const orderId = statusResponse.order_id;
      const transactionStatus = statusResponse.transaction_status;
      
      let status: WebhookPayload['status'] = 'pending';
      
      if (transactionStatus === 'settlement') {
        status = 'paid';
      } else if (['deny', 'cancel', 'expire'].includes(transactionStatus)) {
        status = 'failed';
      }
      
      logger.info('Midtrans: Webhook processed', { orderId, status });
      
      return {
        orderId,
        status,
        ...statusResponse,
      };
    } catch (error) {
      logger.error('Midtrans: Failed to handle webhook', { error, payload });
      throw error;
    }
  }
  
  async cancelPayment(orderId: string): Promise<boolean> {
    if (!this.coreApi) {
      throw new Error('Midtrans not initialized');
    }
    
    try {
      logger.info('Midtrans: Cancelling payment', { orderId });
      
      await this.coreApi.transaction.cancel(orderId);
      
      logger.info('Midtrans: Payment cancelled', { orderId });
      return true;
    } catch (error) {
      logger.error('Midtrans: Failed to cancel payment', { error, orderId });
      return false;
    }
  }
}

// Export singleton
export const midtransProvider = new MidtransProvider();

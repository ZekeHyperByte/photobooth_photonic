/**
 * Mock Payment Provider
 * For testing without real payment gateway
 * Simulates payment flow with automatic "success" after delay
 */

import { logger } from '@photonic/utils';
import type {
  PaymentProvider,
  CreatePaymentParams,
  CreatePaymentResult,
  VerifyPaymentResult,
  PaymentStatusResult,
  WebhookPayload,
} from './provider.interface';

interface MockTransaction {
  orderId: string;
  transactionId: string;
  amount: number;
  status: 'pending' | 'paid' | 'failed' | 'expired';
  createdAt: Date;
  paidAt?: Date;
  expiryTime: Date;
  autoApprove: boolean;
}

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  readonly isAvailable = true;
  
  private transactions: Map<string, MockTransaction> = new Map();
  private autoApproveDelay: number;
  
  constructor(options: { autoApproveDelay?: number } = {}) {
    this.autoApproveDelay = options.autoApproveDelay || 5000; // 5 seconds default
    logger.info('MockPaymentProvider initialized', {
      autoApproveDelay: this.autoApproveDelay,
    });
  }
  
  async initialize(): Promise<void> {
    logger.info('MockPaymentProvider: No initialization needed');
  }
  
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    try {
      logger.info('Mock: Creating payment', { orderId: params.orderId });
      
      const transactionId = `MOCK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const expiryTime = new Date(Date.now() + (params.expiryMinutes || 15) * 60 * 1000);
      
      const transaction: MockTransaction = {
        orderId: params.orderId,
        transactionId,
        amount: params.amount,
        status: 'pending',
        createdAt: new Date(),
        expiryTime,
        autoApprove: true,
      };
      
      this.transactions.set(params.orderId, transaction);
      
      // Auto-approve after delay (simulate user payment)
      if (this.autoApproveDelay > 0) {
        setTimeout(() => {
          this.approvePayment(params.orderId);
        }, this.autoApproveDelay);
      }
      
      logger.info('Mock: Payment created', { 
        orderId: params.orderId, 
        transactionId,
        autoApproveIn: this.autoApproveDelay,
      });
      
      return {
        success: true,
        orderId: params.orderId,
        transactionId,
        amount: params.amount,
        qrCodeUrl: `https://mock-payment.local/qr/${params.orderId}`,
        qrString: `MOCK-QR-${params.orderId}`,
        expiryTime: expiryTime.toISOString(),
        rawResponse: {
          mock: true,
          message: 'This is a mock payment for testing',
          autoApproveDelay: this.autoApproveDelay,
        },
      };
    } catch (error) {
      logger.error('Mock: Failed to create payment', { error });
      throw error;
    }
  }
  
  async verifyPayment(orderId: string): Promise<VerifyPaymentResult> {
    const transaction = this.transactions.get(orderId);
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${orderId}`);
    }
    
    // Check if expired
    if (transaction.status === 'pending' && new Date() > transaction.expiryTime) {
      transaction.status = 'expired';
    }
    
    const isPaid = transaction.status === 'paid';
    
    logger.info('Mock: Verified payment', { 
      orderId, 
      status: transaction.status,
      isPaid,
    });
    
    return {
      success: true,
      orderId,
      isPaid,
      status: transaction.status,
      paymentTime: transaction.paidAt?.toISOString(),
      amount: transaction.amount,
      rawResponse: { mock: true, transaction },
    };
  }
  
  async getPaymentStatus(orderId: string): Promise<PaymentStatusResult> {
    const transaction = this.transactions.get(orderId);
    
    if (!transaction) {
      throw new Error(`Transaction not found: ${orderId}`);
    }
    
    // Check if expired
    if (transaction.status === 'pending' && new Date() > transaction.expiryTime) {
      transaction.status = 'expired';
    }
    
    const isPaid = transaction.status === 'paid';
    const isExpired = transaction.status === 'expired';
    
    return {
      orderId,
      status: transaction.status,
      isPaid,
      isExpired,
      amount: transaction.amount,
      paymentTime: transaction.paidAt?.toISOString(),
      expiryTime: transaction.expiryTime.toISOString(),
    };
  }
  
  async handleWebhook(payload: any): Promise<WebhookPayload | null> {
    logger.info('Mock: Received webhook', { payload });
    
    // Mock provider doesn't need webhooks since we auto-approve
    return null;
  }
  
  async cancelPayment(orderId: string): Promise<boolean> {
    const transaction = this.transactions.get(orderId);
    
    if (!transaction) {
      return false;
    }
    
    if (transaction.status === 'paid') {
      throw new Error('Cannot cancel already paid transaction');
    }
    
    transaction.status = 'cancelled';
    logger.info('Mock: Payment cancelled', { orderId });
    
    return true;
  }
  
  /**
   * Manually approve a payment (for testing)
   */
  approvePayment(orderId: string): boolean {
    const transaction = this.transactions.get(orderId);
    
    if (!transaction) {
      logger.warn('Mock: Cannot approve - transaction not found', { orderId });
      return false;
    }
    
    if (transaction.status !== 'pending') {
      logger.warn('Mock: Cannot approve - transaction not pending', { 
        orderId, 
        status: transaction.status,
      });
      return false;
    }
    
    transaction.status = 'paid';
    transaction.paidAt = new Date();
    
    logger.info('Mock: Payment auto-approved', { orderId });
    return true;
  }
  
  /**
   * Get all transactions (for debugging)
   */
  getAllTransactions(): MockTransaction[] {
    return Array.from(this.transactions.values());
  }
  
  /**
   * Clear all transactions (for testing)
   */
  clearTransactions(): void {
    this.transactions.clear();
    logger.info('Mock: All transactions cleared');
  }
}

// Export singleton instance with 5 second auto-approve
export const mockPaymentProvider = new MockPaymentProvider({
  autoApproveDelay: 5000,
});

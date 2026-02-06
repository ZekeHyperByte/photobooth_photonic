/**
 * Payment Provider Interface
 * Abstract interface for any payment gateway integration
 * Allows swapping between Midtrans, Xendit, Stripe, etc.
 */

export interface CreatePaymentParams {
  orderId: string;
  amount: number;
  itemName: string;
  itemId: string;
  customerDetails?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  };
  expiryMinutes?: number;
}

export interface CreatePaymentResult {
  success: boolean;
  orderId: string;
  transactionId: string;
  amount: number;
  qrCodeUrl?: string;
  qrString?: string;
  deeplinkUrl?: string;
  expiryTime: string;
  rawResponse?: any;
}

export interface VerifyPaymentResult {
  success: boolean;
  orderId: string;
  isPaid: boolean;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
  paymentTime?: string;
  amount?: number;
  rawResponse?: any;
}

export interface PaymentStatusResult {
  orderId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
  isPaid: boolean;
  isExpired: boolean;
  amount: number;
  paymentTime?: string;
  expiryTime?: string;
}

export interface WebhookPayload {
  orderId: string;
  status: string;
  [key: string]: any;
}

export interface PaymentProvider {
  readonly name: string;
  readonly isAvailable: boolean;
  
  /**
   * Initialize the payment provider
   */
  initialize(): Promise<void>;
  
  /**
   * Create a new payment
   */
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;
  
  /**
   * Verify payment status
   */
  verifyPayment(orderId: string): Promise<VerifyPaymentResult>;
  
  /**
   * Get payment status
   */
  getPaymentStatus(orderId: string): Promise<PaymentStatusResult>;
  
  /**
   * Handle webhook notification
   */
  handleWebhook?(payload: any): Promise<WebhookPayload | null>;
  
  /**
   * Cancel a payment
   */
  cancelPayment?(orderId: string): Promise<boolean>;
}

/**
 * Factory function type for creating providers
 */
export type PaymentProviderFactory = () => PaymentProvider;

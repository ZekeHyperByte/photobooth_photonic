/**
 * Payment Service Index
 * Exports payment provider interface, implementations, and manager
 */

export * from './provider.interface';
export * from './mock.provider';
export * from './midtrans.provider';

import { mockPaymentProvider } from './mock.provider';
import { midtransProvider } from './midtrans.provider';
import { logger } from '@photonic/utils';
import { env } from '../../config/env';
import type { PaymentProvider } from './provider.interface';

/**
 * Payment Manager
 * Handles provider selection and initialization
 */
class PaymentManager {
  private provider: PaymentProvider | null = null;
  private providerName: string = 'mock';
  
  /**
   * Initialize the payment system
   * Automatically selects best available provider
   */
  async initialize(): Promise<void> {
    const preferredProvider = env.payment.provider;
    
    logger.info('Initializing payment system', { preferredProvider });
    
    // Try preferred provider first
    if (preferredProvider === 'midtrans' && midtransProvider.isAvailable) {
      try {
        await midtransProvider.initialize();
        this.provider = midtransProvider;
        this.providerName = 'midtrans';
        logger.info('Payment provider: Midtrans');
        return;
      } catch (error) {
        logger.error('Failed to initialize Midtrans, falling back to mock', { error });
      }
    }
    
    // Fallback to mock provider
    await mockPaymentProvider.initialize();
    this.provider = mockPaymentProvider;
    this.providerName = 'mock';
    
    if (preferredProvider === 'midtrans' && !midtransProvider.isAvailable) {
      logger.warn('Midtrans credentials not configured, using mock provider');
      logger.warn('Set MIDTRANS_SERVER_KEY and MIDTRANS_CLIENT_KEY to use real payments');
    } else {
      logger.info('Payment provider: Mock (for testing)');
    }
  }
  
  /**
   * Get current provider
   */
  getProvider(): PaymentProvider {
    if (!this.provider) {
      throw new Error('Payment system not initialized. Call initialize() first.');
    }
    return this.provider;
  }
  
  /**
   * Get current provider name
   */
  getProviderName(): string {
    return this.providerName;
  }
  
  /**
   * Check if using real payment provider
   */
  isRealPayment(): boolean {
    return this.providerName !== 'mock';
  }
  
  /**
   * Check if initialized
   */
  isInitialized(): boolean {
    return this.provider !== null;
  }
}

// Export singleton
export const paymentManager = new PaymentManager();

// Export convenience function to get provider
export function getPaymentProvider(): PaymentProvider {
  return paymentManager.getProvider();
}

/**
 * Central Server Payment Provider
 *
 * Proxies payments to the central server (the analytics-dashboard app), which
 * holds the Midtrans keys, receives the webhook, and is the source of truth.
 * The booth never talks to Midtrans directly. Confirmation = booth polls the
 * central /status endpoint (booth -> server, NAT-safe).
 */

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

interface CentralStatusResponse {
  success: boolean;
  orderId: string;
  status: 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled';
  isPaid: boolean;
  isExpired: boolean;
  amount: number;
  paymentTime?: string;
  expiryTime?: string;
  error?: string;
}

export class CentralServerProvider implements PaymentProvider {
  readonly name = 'central';
  readonly isAvailable: boolean;

  private get baseUrl(): string {
    return env.sync.centralServerUrl;
  }

  constructor() {
    // Same server + key as analytics sync.
    this.isAvailable = !!(env.sync.centralServerUrl && env.sync.centralServerApiKey);
    if (!this.isAvailable) {
      logger.warn('CentralServerProvider: not available - CENTRAL_SERVER_URL / API key missing');
    }
  }

  async initialize(): Promise<void> {
    if (!this.isAvailable) {
      throw new Error('Central payment provider not available - missing CENTRAL_SERVER_URL or API key');
    }
    logger.info('CentralServerProvider initialized', { baseUrl: this.baseUrl });
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'X-API-Key': env.sync.centralServerApiKey,
    };
  }

  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    const res = await fetch(`${this.baseUrl}/api/payments/create`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        orderId: params.orderId,
        boothId: env.sync.boothId,
        amount: params.amount,
        itemId: params.itemId,
        itemName: params.itemName,
        expiryMinutes: params.expiryMinutes,
      }),
    });

    if (!res.ok) {
      throw new Error(`Central create payment failed (${res.status}): ${await res.text()}`);
    }

    const data = (await res.json()) as {
      orderId: string;
      qrCodeUrl: string;
      qrString: string;
      amount: number;
      expiryTime: string;
    };

    return {
      success: true,
      orderId: data.orderId,
      transactionId: data.orderId, // central keys on orderId; no separate token
      amount: data.amount,
      qrCodeUrl: data.qrCodeUrl,
      qrString: data.qrString,
      expiryTime: data.expiryTime,
      rawResponse: data,
    };
  }

  private async fetchStatus(orderId: string): Promise<CentralStatusResponse> {
    const res = await fetch(`${this.baseUrl}/api/payments/status/${encodeURIComponent(orderId)}`, {
      headers: this.headers(),
    });
    if (res.status === 404) {
      throw new Error(`Transaction not found: ${orderId}`);
    }
    if (!res.ok) {
      throw new Error(`Central status failed (${res.status}): ${await res.text()}`);
    }
    return (await res.json()) as CentralStatusResponse;
  }

  async verifyPayment(orderId: string): Promise<VerifyPaymentResult> {
    const s = await this.fetchStatus(orderId);
    return {
      success: true,
      orderId: s.orderId,
      isPaid: s.isPaid,
      status: s.status,
      paymentTime: s.paymentTime,
      amount: s.amount,
      rawResponse: s,
    };
  }

  async getPaymentStatus(orderId: string): Promise<PaymentStatusResult> {
    const s = await this.fetchStatus(orderId);
    return {
      orderId: s.orderId,
      status: s.status,
      isPaid: s.isPaid,
      isExpired: s.isExpired,
      amount: s.amount,
      paymentTime: s.paymentTime,
      expiryTime: s.expiryTime,
    };
  }

  // Webhooks terminate at the central server, not the booth. No-op here.
  async handleWebhook(_payload: any): Promise<WebhookPayload | null> {
    logger.debug('CentralServerProvider: webhook ignored (handled by central server)');
    return null;
  }
}

// Export singleton
export const centralServerProvider = new CentralServerProvider();

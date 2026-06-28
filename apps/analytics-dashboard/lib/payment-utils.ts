import crypto from 'crypto';

// Pure payment helpers — no DB, no Midtrans SDK. Safe to unit-test in isolation.

export type PaymentStatus =
  | 'pending'
  | 'paid'
  | 'failed'
  | 'expired'
  | 'cancelled';

export function mapMidtransStatus(transactionStatus: string): PaymentStatus {
  switch (transactionStatus) {
    case 'settlement':
    case 'capture':
      return 'paid';
    case 'pending':
      return 'pending';
    case 'expire':
      return 'expired';
    case 'cancel':
      return 'cancelled';
    case 'deny':
    case 'failure':
      return 'failed';
    default:
      return 'pending';
  }
}

/**
 * Verify a Midtrans webhook signature (the trust boundary).
 * signature_key = sha512(order_id + status_code + gross_amount + serverKey)
 */
export function verifySignature(
  body: {
    order_id?: string;
    status_code?: string;
    gross_amount?: string;
    signature_key?: string;
  },
  serverKey: string,
): boolean {
  const { order_id, status_code, gross_amount, signature_key } = body;
  if (!order_id || !status_code || !gross_amount || !signature_key) return false;
  const expected = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${serverKey}`)
    .digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature_key);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

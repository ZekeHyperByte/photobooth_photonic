import { CoreApi } from 'midtrans-client';
import { sql } from './db';
import { mapMidtransStatus, type PaymentStatus } from './payment-utils';

export { verifySignature, mapMidtransStatus, type PaymentStatus } from './payment-utils';

// ---------------------------------------------------------------------------
// Midtrans client (server-side only — keys never leave this app)
// ---------------------------------------------------------------------------
function coreApi(): CoreApi {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const clientKey = process.env.MIDTRANS_CLIENT_KEY;
  if (!serverKey || !clientKey) {
    throw new Error('Midtrans credentials not configured');
  }
  return new CoreApi({
    isProduction: process.env.MIDTRANS_ENVIRONMENT === 'production',
    serverKey,
    clientKey,
  });
}

export interface CreateChargeParams {
  orderId: string;
  amount: number;
  itemId: string;
  itemName: string;
  expiryMinutes?: number;
}

export interface ChargeResult {
  orderId: string;
  qrCodeUrl: string;
  qrString: string;
  expiryTime: string;
  raw: any;
}

/** Create a QRIS charge via Midtrans CoreApi. */
export async function createQrisCharge(
  params: CreateChargeParams,
): Promise<ChargeResult> {
  const expiryMinutes = params.expiryMinutes ?? 15;
  const res: any = await coreApi().charge({
    payment_type: 'qris',
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
    qris: { acquirer: 'gopay' },
    custom_expiry: { expiry_duration: expiryMinutes, unit: 'minute' },
  });

  const qrAction = (res.actions || []).find(
    (a: any) => a.name === 'generate-qr-code',
  );

  return {
    orderId: params.orderId,
    qrCodeUrl: qrAction?.url || '',
    qrString: res.qr_string || '',
    expiryTime:
      res.expiry_time ||
      new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString(),
    raw: res,
  };
}

/** Fetch live status from Midtrans. */
export async function fetchMidtransStatus(orderId: string): Promise<{
  status: PaymentStatus;
  raw: any;
}> {
  const res: any = await coreApi().transaction.status(orderId);
  return { status: mapMidtransStatus(res.transaction_status), raw: res };
}

// ---------------------------------------------------------------------------
// Postgres persistence (source of truth)
// ---------------------------------------------------------------------------
export async function initPaymentsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS transactions (
      order_id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL,
      session_id TEXT,
      gross_amount INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      payment_type TEXT NOT NULL DEFAULT 'qris',
      qr_code_url TEXT,
      qr_string TEXT,
      expiry_time TIMESTAMP,
      payment_time TIMESTAMP,
      raw_response JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export interface TransactionRow {
  order_id: string;
  booth_id: string;
  session_id: string | null;
  gross_amount: number;
  status: PaymentStatus;
  payment_type: string;
  qr_code_url: string | null;
  qr_string: string | null;
  expiry_time: string | null;
  payment_time: string | null;
}

export async function insertTransaction(t: {
  orderId: string;
  boothId: string;
  sessionId?: string;
  amount: number;
  qrCodeUrl: string;
  qrString: string;
  expiryTime: string;
  raw: any;
}): Promise<void> {
  await sql`
    INSERT INTO transactions (
      order_id, booth_id, session_id, gross_amount, status,
      qr_code_url, qr_string, expiry_time, raw_response
    ) VALUES (
      ${t.orderId}, ${t.boothId}, ${t.sessionId ?? null}, ${t.amount}, 'pending',
      ${t.qrCodeUrl}, ${t.qrString}, ${t.expiryTime}, ${sql.json(t.raw)}
    )
    ON CONFLICT (order_id) DO NOTHING
  `;
}

export async function getTransaction(
  orderId: string,
): Promise<TransactionRow | null> {
  const rows = await sql<TransactionRow[]>`
    SELECT order_id, booth_id, session_id, gross_amount, status, payment_type,
           qr_code_url, qr_string, expiry_time, payment_time
    FROM transactions WHERE order_id = ${orderId}
  `;
  return rows[0] || null;
}

export async function updateTransactionStatus(
  orderId: string,
  status: PaymentStatus,
  raw: any,
): Promise<void> {
  const paymentTime = status === 'paid' ? new Date().toISOString() : null;
  await sql`
    UPDATE transactions SET
      status = ${status},
      payment_time = COALESCE(transactions.payment_time, ${paymentTime}),
      raw_response = ${sql.json(raw)},
      updated_at = CURRENT_TIMESTAMP
    WHERE order_id = ${orderId}
  `;
}

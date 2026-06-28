import { NextRequest, NextResponse } from 'next/server';
import {
  initPaymentsTable,
  verifySignature,
  mapMidtransStatus,
  getTransaction,
  updateTransactionStatus,
} from '@/lib/payments';

// Midtrans calls this with a public URL. No X-API-Key — the sha512
// signature_key IS the authentication. Reject anything that doesn't verify.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const serverKey = process.env.MIDTRANS_SERVER_KEY;

    if (!serverKey || !verifySignature(body, serverKey)) {
      console.warn('Webhook rejected: invalid signature', { orderId: body?.order_id });
      return NextResponse.json({ success: false, error: 'Invalid signature' }, { status: 401 });
    }

    await initPaymentsTable();

    const orderId = body.order_id as string;
    const status = mapMidtransStatus(body.transaction_status);

    const txn = await getTransaction(orderId);
    if (!txn) {
      // Unknown order — ack so Midtrans stops retrying, but do nothing.
      console.warn('Webhook for unknown order', { orderId });
      return NextResponse.json({ success: true, message: 'Unknown order, ignored' });
    }

    await updateTransactionStatus(orderId, status, body);
    console.log('Webhook processed', { orderId, status });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    // 200 so a transient error doesn't trigger a Midtrans retry storm;
    // the booth's status poll will reconcile regardless.
    return NextResponse.json({ success: false, error: error.message }, { status: 200 });
  }
}

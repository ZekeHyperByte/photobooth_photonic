import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import {
  initPaymentsTable,
  getTransaction,
  fetchMidtransStatus,
  updateTransactionStatus,
} from '@/lib/payments';

export async function GET(
  request: NextRequest,
  { params }: { params: { orderId: string } },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await initPaymentsTable();
    const { orderId } = params;

    let txn = await getTransaction(orderId);
    if (!txn) {
      return NextResponse.json(
        { success: false, error: 'Transaction not found' },
        { status: 404 },
      );
    }

    // If the webhook hasn't settled it yet, poll Midtrans directly so a
    // dropped webhook can't strand a paid customer. (Booth polls us; we poll
    // Midtrans — NAT-safe both hops.)
    if (txn.status === 'pending') {
      try {
        const live = await fetchMidtransStatus(orderId);
        if (live.status !== 'pending') {
          await updateTransactionStatus(orderId, live.status, live.raw);
          txn = (await getTransaction(orderId)) ?? txn;
        }
      } catch (e: any) {
        // Non-fatal: return last-known DB state if Midtrans lookup fails.
        console.warn('Midtrans status refresh failed:', e.message);
      }
    }

    const isPaid = txn.status === 'paid';
    return NextResponse.json({
      success: true,
      orderId: txn.order_id,
      status: txn.status,
      isPaid,
      isExpired: txn.status === 'expired',
      amount: txn.gross_amount,
      paymentTime: txn.payment_time,
      expiryTime: txn.expiry_time,
    });
  } catch (error: any) {
    console.error('Payment status error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

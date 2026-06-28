import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import {
  initPaymentsTable,
  createQrisCharge,
  insertTransaction,
} from '@/lib/payments';

interface CreateBody {
  orderId: string;
  boothId: string;
  sessionId?: string;
  amount: number;
  itemId: string;
  itemName: string;
  expiryMinutes?: number;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as CreateBody;
    if (!body.orderId || !body.boothId || !body.amount || !body.itemId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 },
      );
    }

    await initPaymentsTable();

    const charge = await createQrisCharge({
      orderId: body.orderId,
      amount: body.amount,
      itemId: body.itemId,
      itemName: body.itemName || body.itemId,
      expiryMinutes: body.expiryMinutes,
    });

    await insertTransaction({
      orderId: body.orderId,
      boothId: body.boothId,
      sessionId: body.sessionId,
      amount: body.amount,
      qrCodeUrl: charge.qrCodeUrl,
      qrString: charge.qrString,
      expiryTime: charge.expiryTime,
      raw: charge.raw,
    });

    return NextResponse.json({
      success: true,
      orderId: body.orderId,
      qrCodeUrl: charge.qrCodeUrl,
      qrString: charge.qrString,
      amount: body.amount,
      expiryTime: charge.expiryTime,
    });
  } catch (error: any) {
    console.error('Payment create error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

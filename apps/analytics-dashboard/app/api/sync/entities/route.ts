import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import {
  initEntityTables,
  upsertSessions,
  upsertPhotos,
  upsertTransactions,
} from '@/lib/entities';

export const runtime = 'nodejs';

// Booth pushes completed sessions + their photos + transactions. Upsert by id.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { boothId, sessions = [], photos = [], transactions = [] } =
      (await request.json()) as {
        boothId?: string;
        sessions?: any[];
        photos?: any[];
        transactions?: any[];
      };

    if (!boothId) {
      return NextResponse.json(
        { success: false, error: 'boothId required' },
        { status: 400 },
      );
    }

    await initEntityTables();
    await upsertSessions(boothId, sessions);
    await upsertPhotos(boothId, photos);
    await upsertTransactions(boothId, transactions);

    return NextResponse.json({
      success: true,
      counts: {
        sessions: sessions.length,
        photos: photos.length,
        transactions: transactions.length,
      },
    });
  } catch (error: any) {
    console.error('Entity sync error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

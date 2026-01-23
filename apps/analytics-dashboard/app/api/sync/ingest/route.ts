import { NextRequest, NextResponse } from 'next/server';
import { upsertBooth, upsertDailyStats, logSync, initializeTables } from '@/lib/db';

// Sync payload type
interface SyncPayload {
  boothId: string;
  syncedAt: string;
  period: {
    from: string;
    to: string;
  };
  revenue: {
    total: number;
    transactionCount: number;
    successCount: number;
    failedCount: number;
    byPaymentType: Record<string, { count: number; amount: number }>;
  };
  sessions: {
    total: number;
    completed: number;
  };
  photos: {
    captured: number;
    printed: number;
  };
  health: {
    uptime: number;
    cameraStatus: string;
    diskSpaceGB: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Verify API key
    const apiKey = request.headers.get('X-API-Key');
    if (apiKey !== process.env.API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Initialize tables if needed
    await initializeTables();

    // Parse payload
    const payload: SyncPayload = await request.json();

    // Validate required fields
    if (!payload.boothId || !payload.syncedAt || !payload.period) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Extract date from synced timestamp
    const syncDate = payload.syncedAt.split('T')[0];

    // Upsert booth info
    await upsertBooth(payload.boothId);

    // Upsert daily stats
    await upsertDailyStats(payload.boothId, syncDate, {
      revenue_total: payload.revenue?.total || 0,
      transaction_count: payload.revenue?.transactionCount || 0,
      transaction_success: payload.revenue?.successCount || 0,
      transaction_failed: payload.revenue?.failedCount || 0,
      session_total: payload.sessions?.total || 0,
      session_completed: payload.sessions?.completed || 0,
      photos_captured: payload.photos?.captured || 0,
      photos_printed: payload.photos?.printed || 0,
    });

    // Log sync event
    await logSync(
      payload.boothId,
      payload.syncedAt,
      payload.period.from,
      payload.period.to,
      payload
    );

    return NextResponse.json({
      success: true,
      message: 'Sync data received successfully',
      boothId: payload.boothId,
      syncedAt: payload.syncedAt,
    });
  } catch (error: any) {
    console.error('Sync ingest error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

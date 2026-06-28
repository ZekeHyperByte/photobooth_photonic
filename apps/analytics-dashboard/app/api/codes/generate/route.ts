import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { generateCodes } from '@/lib/codes';

export const runtime = 'nodejs';

// Admin issues a batch of codes centrally (booths pull them via /available).
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { count } = (await request.json()) as { count?: number };
    const n = Math.min(Math.max(Number(count) || 0, 1), 1000);
    const codes = await generateCodes(n);
    return NextResponse.json({ success: true, count: codes.length, codes });
  } catch (error: any) {
    console.error('Codes generate error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { reportUsage, type UsageReport } from '@/lib/codes';

export const runtime = 'nodejs';

// Booth reports consumed codes. First-writer-wins: returns accepted vs
// conflicts (already used elsewhere) so the booth can flag double-use.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const { boothId, codes } = (await request.json()) as {
      boothId?: string;
      codes?: UsageReport[];
    };
    if (!boothId || !Array.isArray(codes)) {
      return NextResponse.json(
        { success: false, error: 'boothId and codes[] required' },
        { status: 400 },
      );
    }
    const result = await reportUsage(boothId, codes);
    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Codes report-usage error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

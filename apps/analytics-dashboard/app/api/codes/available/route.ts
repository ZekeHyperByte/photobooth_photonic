import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { initCodesTable, getAvailable } from '@/lib/codes';

// Booths pull the list of available (unused) codes to cache locally.
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await initCodesTable();
    return NextResponse.json({ success: true, data: await getAvailable() });
  } catch (error: any) {
    console.error('Codes available error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

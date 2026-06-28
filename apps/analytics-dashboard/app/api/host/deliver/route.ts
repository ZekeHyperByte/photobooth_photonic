import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized } from '@/lib/auth';
import { initHostedTable, getHostedPhotos } from '@/lib/hosted';
import { deliverWhatsApp } from '@/lib/whatsapp';

export const runtime = 'nodejs';

// POST { shareId, phoneNumber } -> sends the hosted photos via WhatsApp from the
// central server (provider keys live here, not on the booth).
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { shareId, phoneNumber } = (await request.json()) as {
      shareId?: string;
      phoneNumber?: string;
    };
    if (!shareId || !phoneNumber) {
      return NextResponse.json(
        { success: false, error: 'shareId and phoneNumber required' },
        { status: 400 },
      );
    }

    await initHostedTable();
    const photos = await getHostedPhotos(shareId);
    if (photos.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No photos for shareId' },
        { status: 404 },
      );
    }

    const result = await deliverWhatsApp(
      shareId,
      phoneNumber,
      photos.map((p) => p.url),
    );

    return NextResponse.json({ success: true, ...result });
  } catch (error: any) {
    console.error('Deliver error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isAuthorized } from '@/lib/auth';
import { getStorage } from '@/lib/storage';
import { initHostedTable, insertHostedPhotos, makeQrDataUrl } from '@/lib/hosted';

export const runtime = 'nodejs';

// POST multipart: fields boothId, sessionId? + files[] (the final JPEGs).
// Stores each blob, groups them under a shareId, returns the download URL + QR.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const boothId = String(form.get('boothId') || '');
    const sessionId = form.get('sessionId') ? String(form.get('sessionId')) : null;
    const files = form.getAll('files').filter((f): f is File => f instanceof File);

    if (!boothId || files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'boothId and at least one file required' },
        { status: 400 },
      );
    }

    await initHostedTable();

    const shareId = crypto.randomBytes(6).toString('base64url'); // ~8 chars, URL-safe
    const baseUrl = request.nextUrl.origin;
    const storage = getStorage(baseUrl);

    const stored: { sequenceNumber: number; url: string }[] = [];
    let seq = 1;
    for (const file of files) {
      const bytes = Buffer.from(await file.arrayBuffer());
      const { url } = await storage.put(
        `${shareId}/${seq}.jpg`,
        bytes,
        file.type || 'image/jpeg',
      );
      stored.push({ sequenceNumber: seq, url });
      seq++;
    }

    await insertHostedPhotos(shareId, boothId, sessionId, stored);

    const downloadUrl = `${baseUrl}/d/${shareId}`;
    const qrDataUrl = await makeQrDataUrl(downloadUrl);

    return NextResponse.json({
      success: true,
      shareId,
      downloadUrl,
      qrDataUrl,
      count: stored.length,
    });
  } catch (error: any) {
    console.error('Host upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { readLocal } from '@/lib/storage';

export const runtime = 'nodejs';

// Serves locally-stored hosted photos (dev / no Vercel Blob). Public on purpose
// — the shareId in the path is the unguessable capability. In prod, Vercel Blob
// serves its own public URLs and this route is unused.
export async function GET(
  _request: NextRequest,
  { params }: { params: { key: string[] } },
) {
  try {
    const key = params.key.join('/');
    const bytes = await readLocal(key);
    return new NextResponse(bytes as any, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}

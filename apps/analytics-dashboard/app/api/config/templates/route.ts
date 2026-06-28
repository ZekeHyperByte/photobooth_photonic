import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { isAuthorized } from '@/lib/auth';
import { getStorage } from '@/lib/storage';
import { initTemplatesTable, getTemplates, upsertTemplate } from '@/lib/templates';

export const runtime = 'nodejs';

// GET: booths pull active templates (rows + blob image URLs).
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    await initTemplatesTable();
    return NextResponse.json({ success: true, data: await getTemplates() });
  } catch (error: any) {
    console.error('Config templates GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

// POST (multipart): admin/frame-manager uploads a template. Stores the frame
// (+ optional thumbnail) in blob storage, upserts the row.
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const form = await request.formData();
    const frame = form.get('frame');
    const name = String(form.get('name') || '');
    if (!(frame instanceof File) || !name) {
      return NextResponse.json(
        { success: false, error: 'frame file and name required' },
        { status: 400 },
      );
    }

    await initTemplatesTable();
    const id = String(form.get('id') || crypto.randomBytes(6).toString('hex'));
    const storage = getStorage(request.nextUrl.origin);

    const frameRes = await storage.put(
      `templates/${id}/frame.png`,
      Buffer.from(await frame.arrayBuffer()),
      frame.type || 'image/png',
    );

    let thumbnailUrl: string | null = null;
    const thumb = form.get('thumbnail');
    if (thumb instanceof File) {
      const t = await storage.put(
        `templates/${id}/thumb.png`,
        Buffer.from(await thumb.arrayBuffer()),
        thumb.type || 'image/png',
      );
      thumbnailUrl = t.url;
    }

    const num = (k: string, d: number) => {
      const v = form.get(k);
      return v == null ? d : Number(v);
    };
    const posRaw = form.get('positionData');

    await upsertTemplate({
      id,
      name,
      description: form.get('description') ? String(form.get('description')) : null,
      templateType: form.get('templateType') ? String(form.get('templateType')) : 'overlay',
      positionData: posRaw ? JSON.parse(String(posRaw)) : null,
      photoCount: num('photoCount', 3),
      canvasWidth: num('canvasWidth', 3508),
      canvasHeight: num('canvasHeight', 4960),
      paperSize: form.get('paperSize') ? String(form.get('paperSize')) : 'A3',
      fileUrl: frameRes.url,
      thumbnailUrl,
      displayOrder: num('displayOrder', 0),
    });

    return NextResponse.json({ success: true, id, fileUrl: frameRes.url, thumbnailUrl });
  } catch (error: any) {
    console.error('Config templates POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
}

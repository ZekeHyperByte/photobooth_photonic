import QRCode from 'qrcode';
import { sql } from './db';

// Phase 3: hosted photos. A share groups a session's photos under one shareId;
// the customer scans a QR -> /d/<shareId> to download them.

export async function initHostedTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS hosted_photos (
      id SERIAL PRIMARY KEY,
      share_id TEXT NOT NULL,
      booth_id TEXT NOT NULL,
      session_id TEXT,
      sequence_number INTEGER NOT NULL DEFAULT 0,
      url TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS hosted_photos_share_idx ON hosted_photos (share_id)`;
}

export interface HostedPhoto {
  sequence_number: number;
  url: string;
}

export async function insertHostedPhotos(
  shareId: string,
  boothId: string,
  sessionId: string | null,
  photos: { sequenceNumber: number; url: string }[],
): Promise<void> {
  for (const p of photos) {
    await sql`
      INSERT INTO hosted_photos (share_id, booth_id, session_id, sequence_number, url)
      VALUES (${shareId}, ${boothId}, ${sessionId}, ${p.sequenceNumber}, ${p.url})
    `;
  }
}

export async function getHostedPhotos(shareId: string): Promise<HostedPhoto[]> {
  return sql<HostedPhoto[]>`
    SELECT sequence_number, url FROM hosted_photos
    WHERE share_id = ${shareId} ORDER BY sequence_number
  `;
}

export function makeQrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { margin: 1, width: 320 });
}

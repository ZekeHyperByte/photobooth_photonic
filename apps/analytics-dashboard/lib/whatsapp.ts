import { sql } from './db';

// Phase 3b: WhatsApp delivery from the central server. Provider keys live here,
// not on the booth. Central already hosts the photos (Phase 3), so it sends the
// public photo URLs to the provider — no file streaming.

/** Indonesia-default international formatting (pure — unit-tested). */
export function formatPhoneNumber(phoneNumber: string): string {
  let cleaned = phoneNumber.replace(/\D/g, '');
  if (!cleaned.startsWith('62')) {
    cleaned = cleaned.startsWith('0') ? '62' + cleaned.slice(1) : '62' + cleaned;
  }
  return cleaned;
}

export async function initDeliveriesTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS deliveries (
      id SERIAL PRIMARY KEY,
      share_id TEXT NOT NULL,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      target TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      provider_response JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

export async function recordDelivery(
  shareId: string,
  channel: string,
  target: string,
  status: string,
  raw: unknown,
): Promise<void> {
  await sql`
    INSERT INTO deliveries (share_id, channel, target, status, provider_response)
    VALUES (${shareId}, ${channel}, ${target}, ${status}, ${sql.json(raw as any)})
  `;
}

/** Send one media URL via Fonnte. Throws on transport error. */
async function sendViaFonnte(
  target: string,
  mediaUrl: string,
  caption: string,
): Promise<{ ok: boolean; raw: any }> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!apiKey) throw new Error('WHATSAPP_API_KEY not configured');

  const body = new URLSearchParams({ target, url: mediaUrl, caption });
  const res = await fetch('https://api.fonnte.com/send', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  const raw = await res.json().catch(() => ({}));
  return { ok: res.ok && raw?.status !== false, raw };
}

export interface DeliverResult {
  sent: number;
  failed: number;
}

/** Deliver every hosted photo URL to a phone number via WhatsApp. */
export async function deliverWhatsApp(
  shareId: string,
  phoneNumber: string,
  photoUrls: string[],
): Promise<DeliverResult> {
  await initDeliveriesTable();
  const target = formatPhoneNumber(phoneNumber);
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < photoUrls.length; i++) {
    const caption =
      i === photoUrls.length - 1
        ? 'Thank you for using our photobooth! 📸'
        : `Photo ${i + 1}`;
    try {
      const { ok, raw } = await sendViaFonnte(target, photoUrls[i], caption);
      await recordDelivery(shareId, 'whatsapp', target, ok ? 'sent' : 'failed', raw);
      ok ? sent++ : failed++;
    } catch (e: any) {
      await recordDelivery(shareId, 'whatsapp', target, 'failed', { error: e.message });
      failed++;
    }
  }
  return { sent, failed };
}

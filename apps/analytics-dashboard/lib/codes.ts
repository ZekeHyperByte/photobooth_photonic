import crypto from 'crypto';
import { sql } from './db';

// Booth codes slice (bidirectional): central issues codes; booths pull the
// available ones and report usage back. Reporting is first-writer-wins so a
// code used on one booth can't be reused on another.

export async function initCodesTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS booth_codes (
      code TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'generated',
      booth_id TEXT,
      session_id TEXT,
      used_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

/** Generate up to `count` unique random 4-digit codes. Returns the new codes. */
export async function generateCodes(count: number): Promise<string[]> {
  await initCodesTable();
  const made: string[] = [];
  let attempts = 0;
  while (made.length < count && attempts < count * 20) {
    attempts++;
    const code = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    const res = await sql`
      INSERT INTO booth_codes (code, status) VALUES (${code}, 'generated')
      ON CONFLICT (code) DO NOTHING
      RETURNING code
    `;
    if (res.length > 0) made.push(code);
  }
  return made;
}

export async function getAvailable(limit = 500): Promise<string[]> {
  const rows = await sql<{ code: string }[]>`
    SELECT code FROM booth_codes WHERE status = 'generated'
    ORDER BY created_at LIMIT ${limit}
  `;
  return rows.map((r) => r.code);
}

export interface UsageReport {
  code: string;
  sessionId?: string | null;
  usedAt?: string | null;
}

export interface ReportResult {
  accepted: string[]; // codes this report claimed
  conflicts: string[]; // codes already used (by another booth/session)
}

/** Mark codes used. First-writer-wins: a code already 'used' is a conflict. */
export async function reportUsage(
  boothId: string,
  reports: UsageReport[],
): Promise<ReportResult> {
  await initCodesTable();
  const accepted: string[] = [];
  const conflicts: string[] = [];

  for (const r of reports) {
    // Ensure the code exists (a booth may have issued locally); ignore if present.
    await sql`
      INSERT INTO booth_codes (code, status) VALUES (${r.code}, 'generated')
      ON CONFLICT (code) DO NOTHING
    `;
    const updated = await sql`
      UPDATE booth_codes SET
        status = 'used',
        booth_id = ${boothId},
        session_id = ${r.sessionId ?? null},
        used_at = ${r.usedAt ?? new Date().toISOString()}
      WHERE code = ${r.code} AND status <> 'used'
      RETURNING code
    `;
    (updated.length > 0 ? accepted : conflicts).push(r.code);
  }
  return { accepted, conflicts };
}

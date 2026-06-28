import { sql } from './db';

// Phase 4: per-row records from booths (completed sessions + photos + txns).
// Upserted by id so re-pushes are idempotent. Powers dashboard drill-down.

export async function initEntityTables(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS synced_sessions (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL,
      package_id TEXT,
      status TEXT,
      started_at TIMESTAMP,
      completed_at TIMESTAMP
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS synced_photos (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL,
      session_id TEXT,
      sequence_number INTEGER,
      version INTEGER,
      is_retake BOOLEAN,
      processing_status TEXT,
      template_id TEXT,
      filter_id TEXT,
      capture_time TIMESTAMP
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS synced_transactions (
      id TEXT PRIMARY KEY,
      booth_id TEXT NOT NULL,
      session_id TEXT,
      order_id TEXT,
      gross_amount INTEGER,
      payment_type TEXT,
      transaction_status TEXT,
      provider TEXT,
      transaction_time TIMESTAMP,
      payment_time TIMESTAMP
    )
  `;
}

export async function upsertSessions(boothId: string, rows: any[]): Promise<void> {
  for (const s of rows) {
    await sql`
      INSERT INTO synced_sessions (id, booth_id, package_id, status, started_at, completed_at)
      VALUES (${s.id}, ${boothId}, ${s.packageId ?? null}, ${s.status ?? null},
              ${s.startedAt ?? null}, ${s.completedAt ?? null})
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        completed_at = EXCLUDED.completed_at
    `;
  }
}

export async function upsertPhotos(boothId: string, rows: any[]): Promise<void> {
  for (const p of rows) {
    await sql`
      INSERT INTO synced_photos (
        id, booth_id, session_id, sequence_number, version, is_retake,
        processing_status, template_id, filter_id, capture_time
      ) VALUES (
        ${p.id}, ${boothId}, ${p.sessionId ?? null}, ${p.sequenceNumber ?? null},
        ${p.version ?? null}, ${p.isRetake ?? null}, ${p.processingStatus ?? null},
        ${p.templateId ?? null}, ${p.filterId ?? null}, ${p.captureTime ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        processing_status = EXCLUDED.processing_status,
        version = EXCLUDED.version
    `;
  }
}

// --- read side: dashboard drill-down --------------------------------------

export interface SessionRow {
  id: string;
  booth_id: string;
  package_id: string | null;
  status: string | null;
  started_at: string | null;
  completed_at: string | null;
  photo_count: number;
  amount: number | null;
  txn_status: string | null;
}

export async function getRecentSessions(opts: {
  boothId?: string;
  limit?: number;
} = {}): Promise<SessionRow[]> {
  const limit = opts.limit ?? 100;
  const where = opts.boothId ? sql`WHERE s.booth_id = ${opts.boothId}` : sql``;
  return sql<SessionRow[]>`
    SELECT s.id, s.booth_id, s.package_id, s.status, s.started_at, s.completed_at,
      (SELECT count(*)::int FROM synced_photos p WHERE p.session_id = s.id) AS photo_count,
      (SELECT t.gross_amount FROM synced_transactions t WHERE t.session_id = s.id
         ORDER BY t.transaction_time DESC NULLS LAST LIMIT 1) AS amount,
      (SELECT t.transaction_status FROM synced_transactions t WHERE t.session_id = s.id
         ORDER BY t.transaction_time DESC NULLS LAST LIMIT 1) AS txn_status
    FROM synced_sessions s
    ${where}
    ORDER BY s.completed_at DESC NULLS LAST
    LIMIT ${limit}
  `;
}

export async function getSessionDetail(id: string): Promise<{
  session: any | null;
  photos: any[];
  transactions: any[];
}> {
  const [sessionRows, photos, transactions] = await Promise.all([
    sql`SELECT * FROM synced_sessions WHERE id = ${id}`,
    sql`SELECT * FROM synced_photos WHERE session_id = ${id} ORDER BY sequence_number`,
    sql`SELECT * FROM synced_transactions WHERE session_id = ${id} ORDER BY transaction_time DESC NULLS LAST`,
  ]);
  return { session: sessionRows[0] ?? null, photos: [...photos], transactions: [...transactions] };
}

export async function upsertTransactions(boothId: string, rows: any[]): Promise<void> {
  for (const t of rows) {
    await sql`
      INSERT INTO synced_transactions (
        id, booth_id, session_id, order_id, gross_amount, payment_type,
        transaction_status, provider, transaction_time, payment_time
      ) VALUES (
        ${t.id}, ${boothId}, ${t.sessionId ?? null}, ${t.orderId ?? null},
        ${t.grossAmount ?? null}, ${t.paymentType ?? null}, ${t.transactionStatus ?? null},
        ${t.provider ?? null}, ${t.transactionTime ?? null}, ${t.paymentTime ?? null}
      )
      ON CONFLICT (id) DO UPDATE SET
        transaction_status = EXCLUDED.transaction_status,
        payment_time = EXCLUDED.payment_time
    `;
  }
}

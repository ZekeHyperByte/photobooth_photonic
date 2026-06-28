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

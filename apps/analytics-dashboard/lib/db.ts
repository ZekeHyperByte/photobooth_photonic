import { sql } from '@vercel/postgres';

// Initialize database tables
export async function initializeTables() {
  await sql`
    CREATE TABLE IF NOT EXISTS booths (
      id TEXT PRIMARY KEY,
      name TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS daily_stats (
      id SERIAL PRIMARY KEY,
      booth_id TEXT NOT NULL,
      date DATE NOT NULL,
      revenue_total INTEGER DEFAULT 0,
      transaction_count INTEGER DEFAULT 0,
      transaction_success INTEGER DEFAULT 0,
      transaction_failed INTEGER DEFAULT 0,
      session_total INTEGER DEFAULT 0,
      session_completed INTEGER DEFAULT 0,
      photos_captured INTEGER DEFAULT 0,
      photos_printed INTEGER DEFAULT 0,
      UNIQUE(booth_id, date)
    )
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS sync_logs (
      id SERIAL PRIMARY KEY,
      booth_id TEXT NOT NULL,
      synced_at TIMESTAMP NOT NULL,
      period_from TIMESTAMP NOT NULL,
      period_to TIMESTAMP NOT NULL,
      payload JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

// Get all booths
export async function getBooths() {
  const result = await sql`
    SELECT b.*,
           (SELECT MAX(synced_at) FROM sync_logs WHERE booth_id = b.id) as last_sync
    FROM booths b
    ORDER BY b.name
  `;
  return result.rows;
}

// Get today's stats for all booths
export async function getTodayStats() {
  const today = new Date().toISOString().split('T')[0];
  const result = await sql`
    SELECT
      booth_id,
      SUM(revenue_total) as revenue_total,
      SUM(transaction_count) as transaction_count,
      SUM(transaction_success) as transaction_success,
      SUM(transaction_failed) as transaction_failed,
      SUM(session_total) as session_total,
      SUM(session_completed) as session_completed,
      SUM(photos_captured) as photos_captured,
      SUM(photos_printed) as photos_printed
    FROM daily_stats
    WHERE date = ${today}
    GROUP BY booth_id
  `;
  return result.rows;
}

// Get aggregated stats for today across all booths
export async function getTodayTotals() {
  const today = new Date().toISOString().split('T')[0];
  const result = await sql`
    SELECT
      COALESCE(SUM(revenue_total), 0) as revenue_total,
      COALESCE(SUM(transaction_count), 0) as transaction_count,
      COALESCE(SUM(transaction_success), 0) as transaction_success,
      COALESCE(SUM(transaction_failed), 0) as transaction_failed,
      COALESCE(SUM(session_total), 0) as session_total,
      COALESCE(SUM(session_completed), 0) as session_completed,
      COALESCE(SUM(photos_captured), 0) as photos_captured,
      COALESCE(SUM(photos_printed), 0) as photos_printed
    FROM daily_stats
    WHERE date = ${today}
  `;
  return result.rows[0] || {
    revenue_total: 0,
    transaction_count: 0,
    transaction_success: 0,
    transaction_failed: 0,
    session_total: 0,
    session_completed: 0,
    photos_captured: 0,
    photos_printed: 0,
  };
}

// Upsert booth info
export async function upsertBooth(boothId: string, name?: string) {
  await sql`
    INSERT INTO booths (id, name, updated_at)
    VALUES (${boothId}, ${name || boothId}, CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET
      name = COALESCE(EXCLUDED.name, booths.name),
      updated_at = CURRENT_TIMESTAMP
  `;
}

// Upsert daily stats (aggregate with existing data)
export async function upsertDailyStats(
  boothId: string,
  date: string,
  stats: {
    revenue_total: number;
    transaction_count: number;
    transaction_success: number;
    transaction_failed: number;
    session_total: number;
    session_completed: number;
    photos_captured: number;
    photos_printed: number;
  }
) {
  await sql`
    INSERT INTO daily_stats (
      booth_id, date, revenue_total, transaction_count, transaction_success,
      transaction_failed, session_total, session_completed, photos_captured, photos_printed
    )
    VALUES (
      ${boothId}, ${date}, ${stats.revenue_total}, ${stats.transaction_count},
      ${stats.transaction_success}, ${stats.transaction_failed}, ${stats.session_total},
      ${stats.session_completed}, ${stats.photos_captured}, ${stats.photos_printed}
    )
    ON CONFLICT (booth_id, date) DO UPDATE SET
      revenue_total = daily_stats.revenue_total + EXCLUDED.revenue_total,
      transaction_count = daily_stats.transaction_count + EXCLUDED.transaction_count,
      transaction_success = daily_stats.transaction_success + EXCLUDED.transaction_success,
      transaction_failed = daily_stats.transaction_failed + EXCLUDED.transaction_failed,
      session_total = daily_stats.session_total + EXCLUDED.session_total,
      session_completed = daily_stats.session_completed + EXCLUDED.session_completed,
      photos_captured = daily_stats.photos_captured + EXCLUDED.photos_captured,
      photos_printed = daily_stats.photos_printed + EXCLUDED.photos_printed
  `;
}

// Log sync event
export async function logSync(
  boothId: string,
  syncedAt: string,
  periodFrom: string,
  periodTo: string,
  payload: any
) {
  await sql`
    INSERT INTO sync_logs (booth_id, synced_at, period_from, period_to, payload)
    VALUES (${boothId}, ${syncedAt}, ${periodFrom}, ${periodTo}, ${JSON.stringify(payload)})
  `;
}

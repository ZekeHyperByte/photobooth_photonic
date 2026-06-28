/**
 * Entity Sync Service (Phase 4)
 *
 * Pushes per-row records (completed sessions + their photos + transactions) to
 * the central server so the dashboard can drill down beyond daily aggregates.
 *
 * Incremental by a `completedAt` watermark. Only **completed** sessions are
 * pushed — they're terminal, so they won't change after sync (the schema has no
 * updatedAt, so syncing only terminal rows keeps "changed-since" correct).
 * Central upserts by id, so re-pushing is harmless; the watermark just caps volume.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { and, eq, gt, inArray, asc } from 'drizzle-orm';
import { db } from '../db';
import { sessions, photos, transactions } from '../db/schema';
import type { Session, Photo, Transaction } from '../db/schema';
import { env } from '../config/env';
import { createLogger } from '@photonic/utils';

const logger = createLogger('entity-sync');
const WATERMARK_PATH = path.join(process.cwd(), 'data', 'entity-sync-watermark.json');

// --- pure mappers (no DB; unit-tested) -------------------------------------

export function sessionDTO(s: Session) {
  return {
    id: s.id,
    packageId: s.packageId,
    status: s.status,
    startedAt: s.startedAt?.toISOString() ?? null,
    completedAt: s.completedAt?.toISOString() ?? null,
  };
}

export function photoDTO(p: Photo) {
  return {
    id: p.id,
    sessionId: p.sessionId,
    sequenceNumber: p.sequenceNumber,
    version: p.version,
    isRetake: p.isRetake,
    processingStatus: p.processingStatus,
    templateId: p.templateId,
    filterId: p.filterId,
    captureTime: p.captureTime?.toISOString() ?? null,
  };
}

export function transactionDTO(t: Transaction) {
  return {
    id: t.id,
    sessionId: t.sessionId,
    orderId: t.orderId,
    grossAmount: t.grossAmount,
    paymentType: t.paymentType,
    transactionStatus: t.transactionStatus,
    provider: t.provider,
    transactionTime: t.transactionTime?.toISOString() ?? null,
    paymentTime: t.paymentTime?.toISOString() ?? null,
  };
}

/** Latest completedAt across a batch (the next watermark), or the current one. */
export function nextWatermark(rows: Session[], current: Date): Date {
  return rows.reduce((max, s) => {
    const c = s.completedAt;
    return c && c.getTime() > max.getTime() ? c : max;
  }, current);
}

// --- watermark persistence -------------------------------------------------

function loadWatermark(): Date {
  try {
    const raw = JSON.parse(fs.readFileSync(WATERMARK_PATH, 'utf-8'));
    if (raw?.completedAt) return new Date(raw.completedAt);
  } catch {
    /* first run */
  }
  return new Date(0);
}

function saveWatermark(d: Date): void {
  fs.mkdirSync(path.dirname(WATERMARK_PATH), { recursive: true });
  fs.writeFileSync(WATERMARK_PATH, JSON.stringify({ completedAt: d.toISOString() }));
}

// --- service ---------------------------------------------------------------

class EntitySyncService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (!env.sync.centralServerUrl) return;
    logger.info('Starting entity sync');
    setTimeout(() => this.push(), 8000);
    this.timer = setInterval(() => this.push(), env.sync.syncIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async push(): Promise<void> {
    try {
      const watermark = loadWatermark();

      const completed = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.status, 'completed'), gt(sessions.completedAt, watermark)))
        .orderBy(asc(sessions.completedAt))
        .all();

      if (completed.length === 0) return;

      const ids = completed.map((s) => s.id);
      const [sessionPhotos, sessionTxns] = await Promise.all([
        db.select().from(photos).where(inArray(photos.sessionId, ids)).all(),
        db.select().from(transactions).where(inArray(transactions.sessionId, ids)).all(),
      ]);

      const payload = {
        boothId: env.sync.boothId,
        sessions: completed.map(sessionDTO),
        photos: sessionPhotos.map(photoDTO),
        transactions: sessionTxns.map(transactionDTO),
      };

      const res = await axios.post(
        `${env.sync.centralServerUrl}/api/sync/entities`,
        payload,
        { headers: { 'X-API-Key': env.sync.centralServerApiKey }, timeout: 60000 },
      );
      if (!res.data?.success) throw new Error(res.data?.error || 'entity sync failed');

      saveWatermark(nextWatermark(completed, watermark));
      logger.info('Entity sync pushed', {
        sessions: completed.length,
        photos: sessionPhotos.length,
        transactions: sessionTxns.length,
      });
    } catch (error) {
      // Non-fatal: watermark unchanged, retried next tick.
      logger.warn('Entity sync failed, will retry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

let instance: EntitySyncService | null = null;
export function getEntitySyncService(): EntitySyncService {
  if (!instance) instance = new EntitySyncService();
  return instance;
}

/**
 * Code Sync Service (booth codes slice — bidirectional)
 *
 * Pull: fetch central's available codes, insert any the booth doesn't have
 *   locally (so verify/consume works offline). Never downgrades a locally-'used'
 *   code back to 'generated'.
 * Push: report locally-consumed ('used') codes to central since a usedAt
 *   watermark. Central is first-writer-wins, so double-use across booths is
 *   rejected (reported back as conflicts).
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { and, eq, gt } from 'drizzle-orm';
import { db } from '../db';
import { boothCodes } from '../db/schema';
import type { BoothCode } from '../db/schema';
import { env } from '../config/env';
import { createLogger } from '@photonic/utils';

const logger = createLogger('code-sync');
const WATERMARK_PATH = path.join(process.cwd(), 'data', 'code-sync-watermark.json');

// --- pure helpers (no IO; unit-tested) -------------------------------------

export interface UsageReport {
  code: string;
  sessionId: string | null;
  usedAt: string | null;
}

export function toUsageReports(rows: BoothCode[]): UsageReport[] {
  return rows.map((c) => ({
    code: c.code,
    sessionId: c.usedBySessionId ?? null,
    usedAt: c.usedAt ? c.usedAt.toISOString() : null,
  }));
}

/** Latest usedAt across a batch (the next watermark), or the current one. */
export function nextUsedWatermark(rows: BoothCode[], current: Date): Date {
  return rows.reduce((max, c) => {
    const u = c.usedAt;
    return u && u.getTime() > max.getTime() ? u : max;
  }, current);
}

// --- watermark persistence -------------------------------------------------

function loadWatermark(): Date {
  try {
    const raw = JSON.parse(fs.readFileSync(WATERMARK_PATH, 'utf-8'));
    if (raw?.usedAt) return new Date(raw.usedAt);
  } catch {
    /* first run */
  }
  return new Date(0);
}

function saveWatermark(d: Date): void {
  fs.mkdirSync(path.dirname(WATERMARK_PATH), { recursive: true });
  fs.writeFileSync(WATERMARK_PATH, JSON.stringify({ usedAt: d.toISOString() }));
}

// --- service ---------------------------------------------------------------

class CodeSyncService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (!env.sync.centralServerUrl) return;
    logger.info('Starting code sync');
    setTimeout(() => this.tick(), 6000);
    this.timer = setInterval(() => this.tick(), env.sync.syncIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async tick(): Promise<void> {
    await Promise.allSettled([this.pullAvailable(), this.pushUsed()]);
  }

  /** Insert central's available codes the booth doesn't already have. */
  async pullAvailable(): Promise<void> {
    try {
      const res = await axios.get(`${env.sync.centralServerUrl}/api/codes/available`, {
        headers: { 'X-API-Key': env.sync.centralServerApiKey },
        timeout: 30000,
      });
      const codes: string[] = res.data?.data || [];
      if (codes.length === 0) return;

      for (const code of codes) {
        // onConflictDoNothing on the unique `code` column: never downgrades a
        // locally-'used' code, never overwrites an existing row.
        db.insert(boothCodes)
          .values({ id: code, code, status: 'generated', generatedBy: 'central' })
          .onConflictDoNothing({ target: boothCodes.code })
          .run();
      }
      logger.info(`Code sync: pulled ${codes.length} available codes`);
    } catch (error) {
      logger.warn('Code pull failed, using local cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Report locally-consumed codes to central since the watermark. */
  async pushUsed(): Promise<void> {
    try {
      const watermark = loadWatermark();
      const used = await db
        .select()
        .from(boothCodes)
        .where(and(eq(boothCodes.status, 'used'), gt(boothCodes.usedAt, watermark)))
        .all();
      if (used.length === 0) return;

      const res = await axios.post(
        `${env.sync.centralServerUrl}/api/codes/report-usage`,
        { boothId: env.sync.boothId, codes: toUsageReports(used) },
        { headers: { 'X-API-Key': env.sync.centralServerApiKey }, timeout: 30000 },
      );
      if (!res.data?.success) throw new Error(res.data?.error || 'report failed');

      if (res.data.conflicts?.length > 0) {
        logger.warn('Code usage conflicts (already used elsewhere)', {
          conflicts: res.data.conflicts,
        });
      }
      saveWatermark(nextUsedWatermark(used, watermark));
      logger.info('Code sync: reported usage', {
        accepted: res.data.accepted?.length ?? 0,
        conflicts: res.data.conflicts?.length ?? 0,
      });
    } catch (error) {
      logger.warn('Code usage report failed, will retry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

let instance: CodeSyncService | null = null;
export function getCodeSyncService(): CodeSyncService {
  if (!instance) instance = new CodeSyncService();
  return instance;
}

/**
 * Config Sync Service (Phase 2)
 *
 * Pulls config (source of truth = central server) into the booth's local
 * SQLite cache on boot + on an interval. The booth always reads its local DB
 * (routes unchanged); this just keeps that cache fresh. If the pull fails, the
 * booth keeps running on the last-known local rows — offline-safe.
 *
 * Deliberately upsert-only: a pull NEVER deletes local rows. Removal is
 * propagated softly by central sending `isActive: false`. (Hard-delete
 * propagation is deferred — see docs/plans/phase-2-config.md.)
 *
 * Scope today: packages + filters (row-only). Templates (image files) and
 * booth codes (bidirectional) are later slices.
 */

import { createLogger } from '@photonic/utils';
import { env } from '../config/env';
import { db as defaultDb } from '../db';
import { packages, filters } from '../db/schema';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from '../db/schema';

const logger = createLogger('config-sync');

type Db = BetterSQLite3Database<typeof schema>;

export interface PackageDTO {
  id: string;
  name: string;
  description?: string | null;
  photoCount: number;
  price: number;
  currency?: string;
  isActive: boolean;
  displayOrder: number;
}

export interface FilterDTO {
  id: string;
  name: string;
  description?: string | null;
  filterConfig: unknown;
  isActive: boolean;
  displayOrder: number;
}

// --- pure row builders (defaults/coalescing — unit-testable, no driver) -----

export function packageValues(r: PackageDTO) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    photoCount: r.photoCount,
    price: r.price,
    currency: r.currency ?? 'IDR',
    isActive: r.isActive,
    displayOrder: r.displayOrder,
    updatedAt: new Date(),
  };
}

export function filterValues(r: FilterDTO) {
  return {
    id: r.id,
    name: r.name,
    description: r.description ?? null,
    filterConfig: r.filterConfig,
    isActive: r.isActive,
    displayOrder: r.displayOrder,
  };
}

// --- upsert helpers (insert-or-update by id; NEVER delete) ------------------

export function upsertPackages(db: Db, rows: PackageDTO[]): number {
  for (const r of rows) {
    const values = packageValues(r);
    db.insert(packages)
      .values(values)
      .onConflictDoUpdate({ target: packages.id, set: values })
      .run();
  }
  return rows.length;
}

export function upsertFilters(db: Db, rows: FilterDTO[]): number {
  for (const r of rows) {
    const values = filterValues(r);
    db.insert(filters)
      .values(values)
      .onConflictDoUpdate({ target: filters.id, set: values })
      .run();
  }
  return rows.length;
}

// --- service ---------------------------------------------------------------

class ConfigSyncService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (!env.sync.centralServerUrl) {
      logger.warn('CENTRAL_SERVER_URL not set, config sync disabled (using local seed)');
      return;
    }
    logger.info('Starting config sync', { centralServerUrl: env.sync.centralServerUrl });

    // Pull shortly after boot, then on the same cadence as analytics sync.
    setTimeout(() => this.pullAll(), 3000);
    this.timer = setInterval(() => this.pullAll(), env.sync.syncIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pullAll(): Promise<void> {
    await Promise.allSettled([this.pull('packages'), this.pull('filters')]);
  }

  private async pull(entity: 'packages' | 'filters'): Promise<void> {
    try {
      const res = await fetch(`${env.sync.centralServerUrl}/api/config/${entity}`, {
        headers: { 'X-API-Key': env.sync.centralServerApiKey },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = (await res.json()) as { success: boolean; data: any[] };
      const rows = body.data || [];

      // Empty central response = not configured yet; keep local cache intact.
      if (rows.length === 0) {
        logger.info(`Config pull: ${entity} empty from central, keeping local cache`);
        return;
      }

      const n =
        entity === 'packages'
          ? upsertPackages(defaultDb, rows as PackageDTO[])
          : upsertFilters(defaultDb, rows as FilterDTO[]);
      logger.info(`Config pull: cached ${n} ${entity} from central`);
    } catch (error) {
      // Non-fatal: booth keeps running on its local cache.
      logger.warn(`Config pull failed for ${entity}, using local cache`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

let instance: ConfigSyncService | null = null;
export function getConfigSyncService(): ConfigSyncService {
  if (!instance) instance = new ConfigSyncService();
  return instance;
}

/**
 * Template Sync Service (templates slice)
 *
 * Like config-sync, but templates carry binary frame images. Pull rows from
 * central, download each frame (+thumbnail) to local disk, and upsert the local
 * templates row with the LOCAL filePath (image-processor reads it via fs).
 *
 * Pull-only (never deletes; soft-delete via isActive). Re-downloads a frame only
 * when it's missing or central's updatedAt is newer — so the hourly pull doesn't
 * refetch unchanged binaries.
 */

import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { templates } from '../db/schema';
import { env } from '../config/env';
import { createLogger } from '@photonic/utils';

const logger = createLogger('template-sync');

export interface TemplateDTO {
  id: string;
  name: string;
  description: string | null;
  templateType: string;
  positionData: unknown;
  photoCount: number;
  canvasWidth: number;
  canvasHeight: number;
  paperSize: string;
  fileUrl: string;
  thumbnailUrl: string | null;
  isActive: boolean;
  displayOrder: number;
  updatedAt: string;
}

// --- pure helpers (no IO; unit-tested) -------------------------------------

export function templateLocalPaths(baseDir: string, id: string) {
  const dir = path.join(baseDir, id);
  return { dir, framePath: path.join(dir, 'frame.png'), thumbPath: path.join(dir, 'thumb.png') };
}

/** Re-download only if the frame is missing or central's row is newer. */
export function needsDownload(
  frameExists: boolean,
  localUpdatedAt: Date | null,
  remoteUpdatedAt: Date,
): boolean {
  if (!frameExists || !localUpdatedAt) return true;
  return remoteUpdatedAt.getTime() > localUpdatedAt.getTime();
}

export function templateValues(
  t: TemplateDTO,
  framePath: string,
  thumbPath: string | null,
) {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? null,
    filePath: framePath,
    thumbnailPath: thumbPath,
    templateType: t.templateType,
    positionData: t.positionData,
    photoCount: t.photoCount,
    canvasWidth: t.canvasWidth,
    canvasHeight: t.canvasHeight,
    paperSize: t.paperSize,
    isActive: t.isActive,
    displayOrder: t.displayOrder,
    updatedAt: new Date(t.updatedAt),
  };
}

// --- service ---------------------------------------------------------------

async function download(url: string, dest: string): Promise<void> {
  const res = await axios.get(url, { responseType: 'arraybuffer', timeout: 60000 });
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  await fs.promises.writeFile(dest, Buffer.from(res.data));
}

class TemplateSyncService {
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    if (!env.sync.centralServerUrl) return;
    logger.info('Starting template sync');
    setTimeout(() => this.pull(), 5000);
    this.timer = setInterval(() => this.pull(), env.sync.syncIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async pull(): Promise<void> {
    try {
      const res = await axios.get(`${env.sync.centralServerUrl}/api/config/templates`, {
        headers: { 'X-API-Key': env.sync.centralServerApiKey },
        timeout: 30000,
      });
      const rows: TemplateDTO[] = res.data?.data || [];
      if (rows.length === 0) {
        logger.info('Template sync: central empty, keeping local cache');
        return;
      }

      let cached = 0;
      for (const t of rows) {
        const { framePath, thumbPath } = templateLocalPaths(env.templatesPath, t.id);
        const local = await db.select().from(templates).where(eq(templates.id, t.id)).get();

        if (needsDownload(fs.existsSync(framePath), local?.updatedAt ?? null, new Date(t.updatedAt))) {
          await download(t.fileUrl, framePath);
          if (t.thumbnailUrl) await download(t.thumbnailUrl, thumbPath);
          cached++;
        }

        const values = templateValues(t, framePath, t.thumbnailUrl ? thumbPath : null);
        db.insert(templates).values(values).onConflictDoUpdate({ target: templates.id, set: values }).run();
      }
      logger.info(`Template sync: ${rows.length} rows, ${cached} frames downloaded`);
    } catch (error) {
      logger.warn('Template sync failed, using local cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

let instance: TemplateSyncService | null = null;
export function getTemplateSyncService(): TemplateSyncService {
  if (!instance) instance = new TemplateSyncService();
  return instance;
}

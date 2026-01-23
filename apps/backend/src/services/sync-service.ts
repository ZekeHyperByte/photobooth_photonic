import { createLogger } from '@photonic/utils';
import { env } from '../config/env';
import { db } from '../db';
import { transactions, sessions, photos, printQueue } from '../db/schema';
import { and, gte, lte, eq, sql } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getCameraService } from './camera-service';

const logger = createLogger('sync-service');

// Sync payload interface
interface SyncPayload {
  boothId: string;
  syncedAt: string;
  period: {
    from: string;
    to: string;
  };
  revenue: {
    total: number;
    transactionCount: number;
    successCount: number;
    failedCount: number;
    byPaymentType: Record<string, { count: number; amount: number }>;
  };
  sessions: {
    total: number;
    completed: number;
  };
  photos: {
    captured: number;
    printed: number;
  };
  health: {
    uptime: number;
    cameraStatus: string;
    diskSpaceGB: number;
  };
}

// Queue item for failed syncs
interface QueueItem {
  id: string;
  payload: SyncPayload;
  attempts: number;
  createdAt: string;
  lastAttempt?: string;
}

const SYNC_QUEUE_PATH = path.join(process.cwd(), 'data', 'sync-queue.json');
const MAX_RETRY_ATTEMPTS = 3;

class SyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private lastSyncTime: Date | null = null;
  private isSyncing = false;

  /**
   * Start the sync service with hourly interval
   */
  start(): void {
    if (!env.sync.centralServerUrl) {
      logger.warn('CENTRAL_SERVER_URL not configured, sync service disabled');
      return;
    }

    logger.info('Starting sync service', {
      boothId: env.sync.boothId,
      intervalMs: env.sync.syncIntervalMs,
      centralServerUrl: env.sync.centralServerUrl,
    });

    // Process any queued syncs on startup
    this.processQueue();

    // Start the interval
    this.syncInterval = setInterval(() => {
      this.performSync();
    }, env.sync.syncIntervalMs);

    // Also perform an initial sync after a short delay
    setTimeout(() => this.performSync(), 5000);
  }

  /**
   * Stop the sync service
   */
  stop(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    logger.info('Sync service stopped');
  }

  /**
   * Manually trigger a sync
   */
  async triggerSync(): Promise<SyncPayload> {
    return this.performSync();
  }

  /**
   * Get sync service status
   */
  getStatus(): {
    isRunning: boolean;
    lastSyncTime: Date | null;
    isSyncing: boolean;
    queuedItems: number;
  } {
    const queue = this.loadQueue();
    return {
      isRunning: this.syncInterval !== null,
      lastSyncTime: this.lastSyncTime,
      isSyncing: this.isSyncing,
      queuedItems: queue.length,
    };
  }

  /**
   * Perform the sync operation
   */
  private async performSync(): Promise<SyncPayload> {
    if (this.isSyncing) {
      logger.warn('Sync already in progress, skipping');
      throw new Error('Sync already in progress');
    }

    this.isSyncing = true;

    try {
      // Calculate period (last hour or since last sync)
      const now = new Date();
      const periodFrom = this.lastSyncTime || new Date(now.getTime() - env.sync.syncIntervalMs);
      const periodTo = now;

      logger.info('Performing sync', {
        from: periodFrom.toISOString(),
        to: periodTo.toISOString(),
      });

      // Aggregate data
      const payload = await this.aggregateData(periodFrom, periodTo);

      // Try to send to central server
      await this.sendToServer(payload);

      // Update last sync time on success
      this.lastSyncTime = now;

      // Also process any queued items
      await this.processQueue();

      logger.info('Sync completed successfully');
      return payload;
    } catch (error: any) {
      logger.error('Sync failed', { error: error.message });
      throw error;
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Aggregate data for the sync period
   */
  private async aggregateData(from: Date, to: Date): Promise<SyncPayload> {
    // Get transactions in period
    const periodTransactions = await db.query.transactions.findMany({
      where: and(
        gte(transactions.transactionTime, from),
        lte(transactions.transactionTime, to)
      ),
    });

    // Calculate revenue stats
    const successTransactions = periodTransactions.filter(
      (t) => t.transactionStatus === 'settlement' || t.transactionStatus === 'capture'
    );
    const failedTransactions = periodTransactions.filter(
      (t) => t.transactionStatus === 'deny' || t.transactionStatus === 'cancel' || t.transactionStatus === 'expire'
    );

    const totalRevenue = successTransactions.reduce((sum, t) => sum + t.grossAmount, 0);

    // Group by payment type
    const byPaymentType: Record<string, { count: number; amount: number }> = {};
    for (const t of successTransactions) {
      const type = t.paymentType || 'unknown';
      if (!byPaymentType[type]) {
        byPaymentType[type] = { count: 0, amount: 0 };
      }
      byPaymentType[type].count++;
      byPaymentType[type].amount += t.grossAmount;
    }

    // Get sessions in period
    const periodSessions = await db.query.sessions.findMany({
      where: and(
        gte(sessions.startedAt, from),
        lte(sessions.startedAt, to)
      ),
    });

    const completedSessions = periodSessions.filter(
      (s) => s.status === 'completed'
    );

    // Get photos in period
    const periodPhotos = await db.query.photos.findMany({
      where: and(
        gte(photos.captureTime, from),
        lte(photos.captureTime, to)
      ),
    });

    // Get printed items in period
    const periodPrints = await db.query.printQueue.findMany({
      where: and(
        eq(printQueue.status, 'completed'),
        gte(printQueue.printedAt, from),
        lte(printQueue.printedAt, to)
      ),
    });

    // Get health info
    const cameraService = getCameraService();
    const cameraStatus = await cameraService.getStatus();
    const diskSpace = await this.getDiskSpace();

    const payload: SyncPayload = {
      boothId: env.sync.boothId,
      syncedAt: new Date().toISOString(),
      period: {
        from: from.toISOString(),
        to: to.toISOString(),
      },
      revenue: {
        total: totalRevenue,
        transactionCount: periodTransactions.length,
        successCount: successTransactions.length,
        failedCount: failedTransactions.length,
        byPaymentType,
      },
      sessions: {
        total: periodSessions.length,
        completed: completedSessions.length,
      },
      photos: {
        captured: periodPhotos.length,
        printed: periodPrints.length,
      },
      health: {
        uptime: process.uptime(),
        cameraStatus: cameraStatus.connected ? 'connected' : 'disconnected',
        diskSpaceGB: diskSpace,
      },
    };

    return payload;
  }

  /**
   * Send payload to central server
   */
  private async sendToServer(payload: SyncPayload): Promise<void> {
    if (!env.sync.centralServerUrl) {
      throw new Error('Central server URL not configured');
    }

    try {
      const response = await axios.post(
        `${env.sync.centralServerUrl}/api/sync/ingest`,
        payload,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': env.sync.centralServerApiKey,
          },
          timeout: 30000,
        }
      );

      if (response.status !== 200 && response.status !== 201) {
        throw new Error(`Server returned status ${response.status}`);
      }

      logger.info('Payload sent to central server successfully');
    } catch (error: any) {
      logger.error('Failed to send to central server', { error: error.message });

      // Queue the payload for retry
      this.queuePayload(payload);

      throw error;
    }
  }

  /**
   * Queue a failed payload for retry
   */
  private queuePayload(payload: SyncPayload): void {
    const queue = this.loadQueue();

    const queueItem: QueueItem = {
      id: `sync-${Date.now()}`,
      payload,
      attempts: 1,
      createdAt: new Date().toISOString(),
      lastAttempt: new Date().toISOString(),
    };

    queue.push(queueItem);
    this.saveQueue(queue);

    logger.info('Payload queued for retry', { queueId: queueItem.id });
  }

  /**
   * Process the queue of failed syncs
   */
  private async processQueue(): Promise<void> {
    const queue = this.loadQueue();

    if (queue.length === 0) {
      return;
    }

    logger.info('Processing sync queue', { items: queue.length });

    const remainingQueue: QueueItem[] = [];

    for (const item of queue) {
      if (item.attempts >= MAX_RETRY_ATTEMPTS) {
        logger.warn('Dropping sync item after max retries', {
          queueId: item.id,
          attempts: item.attempts,
        });
        continue;
      }

      try {
        await this.sendToServer(item.payload);
        logger.info('Queued sync item sent successfully', { queueId: item.id });
      } catch (error) {
        // Update retry count and keep in queue
        item.attempts++;
        item.lastAttempt = new Date().toISOString();
        remainingQueue.push(item);
      }
    }

    this.saveQueue(remainingQueue);
  }

  /**
   * Load queue from disk
   */
  private loadQueue(): QueueItem[] {
    try {
      if (fs.existsSync(SYNC_QUEUE_PATH)) {
        const data = fs.readFileSync(SYNC_QUEUE_PATH, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      logger.error('Failed to load sync queue', { error });
    }
    return [];
  }

  /**
   * Save queue to disk
   */
  private saveQueue(queue: QueueItem[]): void {
    try {
      const dir = path.dirname(SYNC_QUEUE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SYNC_QUEUE_PATH, JSON.stringify(queue, null, 2));
    } catch (error) {
      logger.error('Failed to save sync queue', { error });
    }
  }

  /**
   * Get available disk space in GB
   */
  private async getDiskSpace(): Promise<number> {
    try {
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);

      const { stdout } = await execAsync('df -BG . | tail -1 | awk \'{print $4}\'');
      const spaceGB = parseFloat(stdout.replace('G', '').trim());
      return isNaN(spaceGB) ? 0 : spaceGB;
    } catch (error) {
      logger.warn('Failed to get disk space', { error });
      return 0;
    }
  }
}

// Singleton instance
let syncService: SyncService | null = null;

export function getSyncService(): SyncService {
  if (!syncService) {
    syncService = new SyncService();
  }
  return syncService;
}

export { SyncPayload };

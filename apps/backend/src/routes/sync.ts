import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createLogger } from '@photonic/utils';
import { HTTP_STATUS } from '@photonic/config';
import { getSyncService } from '../services/sync-service';

const logger = createLogger('sync-routes');

/**
 * Sync Routes
 * Handles sync triggers and status for central analytics
 */
export async function syncRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/sync/trigger
   * Manually trigger a sync to central server
   */
  fastify.post(
    '/api/sync/trigger',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Manual sync trigger requested');

        const syncService = getSyncService();
        const payload = await syncService.triggerSync();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Sync completed successfully',
          data: {
            syncedAt: payload.syncedAt,
            period: payload.period,
            revenue: payload.revenue,
            sessions: payload.sessions,
            photos: payload.photos,
          },
        });
      } catch (error: any) {
        logger.error('Manual sync failed', { error: error.message });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Sync Failed',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/sync/status
   * Get sync service status
   */
  fastify.get(
    '/api/sync/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const syncService = getSyncService();
        const status = syncService.getStatus();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            isRunning: status.isRunning,
            lastSyncTime: status.lastSyncTime?.toISOString() || null,
            isSyncing: status.isSyncing,
            queuedItems: status.queuedItems,
          },
        });
      } catch (error: any) {
        logger.error('Failed to get sync status', { error: error.message });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Status Error',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/sync/start
   * Start the sync service
   */
  fastify.post(
    '/api/sync/start',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const syncService = getSyncService();
        syncService.start();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Sync service started',
        });
      } catch (error: any) {
        logger.error('Failed to start sync service', { error: error.message });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Start Error',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/sync/stop
   * Stop the sync service
   */
  fastify.post(
    '/api/sync/stop',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const syncService = getSyncService();
        syncService.stop();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Sync service stopped',
        });
      } catch (error: any) {
        logger.error('Failed to stop sync service', { error: error.message });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          error: 'Stop Error',
          message: error.message,
        });
      }
    }
  );

  logger.info('Sync routes registered');
}

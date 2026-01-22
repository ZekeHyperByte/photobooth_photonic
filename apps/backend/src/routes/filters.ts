import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db';
import { filters } from '../db/schema';
import { eq } from 'drizzle-orm';
import { HTTP_STATUS } from '@photonic/config';
import { createLogger } from '@photonic/utils';

const logger = createLogger('filters');

export async function filterRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/filters
   * Get all active filters
   */
  fastify.get(
    '/api/filters',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Fetching all active filters');

        const activeFilters = await db
          .select()
          .from(filters)
          .where(eq(filters.isActive, true))
          .orderBy(filters.displayOrder)
          .all();

        logger.info(`Found ${activeFilters.length} active filters`);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: activeFilters,
        });
      } catch (error) {
        logger.error('Failed to fetch filters', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch filters',
        });
      }
    }
  );

  /**
   * GET /api/filters/:id
   * Get a single filter by ID
   */
  fastify.get(
    '/api/filters/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Fetching filter by ID', { filterId: id });

        const filter = await db
          .select()
          .from(filters)
          .where(eq(filters.id, id))
          .get();

        if (!filter) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Filter not found',
          });
        }

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: filter,
        });
      } catch (error) {
        logger.error('Failed to fetch filter', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch filter',
        });
      }
    }
  );

  /**
   * GET /api/filters/:id/thumbnail
   * Get filter thumbnail image
   */
  fastify.get(
    '/api/filters/:id/thumbnail',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Fetching filter thumbnail', { filterId: id });

        const filter = await db
          .select()
          .from(filters)
          .where(eq(filters.id, id))
          .get();

        if (!filter || !filter.thumbnailPath) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Filter thumbnail not found',
          });
        }

        return reply.sendFile(filter.thumbnailPath.replace(/^.*\/data\//, ''));
      } catch (error) {
        logger.error('Failed to fetch filter thumbnail', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch filter thumbnail',
        });
      }
    }
  );
}

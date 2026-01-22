import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db';
import { packages } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ENDPOINTS, HTTP_STATUS } from '@photonic/config';
import { logger } from '@photonic/utils';

/**
 * Package Routes
 * Handles listing and managing photo packages
 */
export async function packageRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/packages
   * List all active packages
   */
  fastify.get(
    ENDPOINTS.PACKAGES,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Fetching active packages');

        // Get all active packages ordered by display order
        const activePackages = await db
          .select()
          .from(packages)
          .where(eq(packages.isActive, true))
          .orderBy(packages.displayOrder)
          .all();

        logger.info('Packages fetched', { count: activePackages.length });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: activePackages,
        });
      } catch (error) {
        logger.error('Failed to fetch packages', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch packages',
        });
      }
    }
  );

  /**
   * GET /api/packages/:id
   * Get a single package by ID
   */
  fastify.get(
    `${ENDPOINTS.PACKAGES}/:id`,
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Fetching package', { id });

        const packageData = await db
          .select()
          .from(packages)
          .where(eq(packages.id, id))
          .get();

        if (!packageData) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Package not found',
          });
        }

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: packageData,
        });
      } catch (error) {
        logger.error('Failed to fetch package', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch package',
        });
      }
    }
  );
}

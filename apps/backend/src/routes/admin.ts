import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db';
import { packages, sessions, transactions, photos, boothCodes } from '../db/schema';
import { eq, desc, sql } from 'drizzle-orm';
import { ENDPOINTS, HTTP_STATUS } from '@photonic/config';
import { logger } from '@photonic/utils';
import { nanoid } from 'nanoid';

/**
 * Admin Routes
 * Handles admin panel operations for managing packages, viewing analytics, etc.
 */
export async function adminRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/admin/dashboard
   * Get dashboard analytics
   */
  fastify.get(
    `${ENDPOINTS.ADMIN_DASHBOARD || '/api/admin/dashboard'}`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Fetching dashboard analytics');

        // Simple queries using raw counts
        const allSessions = await db.select().from(sessions).all();
        const totalSessions = allSessions.length;
        const completedSessions = allSessions.filter(s => s.status === 'completed').length;

        const allTransactions = await db.select().from(transactions).all();
        const totalRevenue = allTransactions
          .filter(t => t.status === 'settlement')
          .reduce((sum, t) => sum + (t.grossAmount || 0), 0);

        const allPhotos = await db.select().from(photos).all();
        const totalPhotos = allPhotos.length;

        // Get recent sessions (last 10)
        const recentSessions = allSessions
          .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0))
          .slice(0, 10);

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            totalSessions,
            completedSessions,
            totalRevenue,
            totalPhotos,
            recentSessions,
          },
        });
      } catch (error) {
        logger.error('Failed to fetch dashboard', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch dashboard data',
        });
      }
    }
  );

  /**
   * POST /api/admin/codes/generate
   * Generate single-use 4-digit codes (batch or single)
   */
  fastify.post(
    '/api/admin/codes/generate',
    async (
      request: FastifyRequest<{
        Body: {
          count?: number;
          generatedBy?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { count = 1, generatedBy = 'admin' } = request.body;

        logger.info('Generating booth codes', { count });

        const codes = [];

        for (let i = 0; i < count; i++) {
          // Generate unique 4-digit code
          let code = Math.floor(Math.random() * 10000)
            .toString()
            .padStart(4, '0');

          // Check uniqueness
          let existingCode = await db
            .select()
            .from(boothCodes)
            .where(eq(boothCodes.code, code))
            .get();

          while (existingCode) {
            code = Math.floor(Math.random() * 10000)
              .toString()
              .padStart(4, '0');
            existingCode = await db
              .select()
              .from(boothCodes)
              .where(eq(boothCodes.code, code))
              .get();
          }

          const newCode = {
            id: nanoid(),
            code,
            status: 'generated',
            generatedBy,
            generatedAt: new Date(),
            usedAt: null,
            usedBySessionId: null,
            metadata: null,
          };

          await db.insert(boothCodes).values(newCode).run();
          codes.push(newCode);
        }

        logger.info('Booth codes generated', { count: codes.length });

        return reply.code(HTTP_STATUS.CREATED).send({
          success: true,
          data: codes,
        });
      } catch (error) {
        logger.error('Failed to generate codes', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to generate codes',
        });
      }
    }
  );

  /**
   * GET /api/admin/codes
   * List all codes with status filter
   */
  fastify.get(
    '/api/admin/codes',
    async (
      request: FastifyRequest<{
        Querystring: { status?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { status } = request.query;

        logger.info('Fetching booth codes', { status });

        let query = db.select().from(boothCodes);

        if (status) {
          query = query.where(eq(boothCodes.status, status));
        }

        const codes = await query.orderBy(desc(boothCodes.generatedAt)).all();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: codes,
        });
      } catch (error) {
        logger.error('Failed to fetch codes', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch codes',
        });
      }
    }
  );

  /**
   * GET /api/admin/codes/:code
   * Get specific code details and usage history
   */
  fastify.get(
    '/api/admin/codes/:code',
    async (
      request: FastifyRequest<{ Params: { code: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { code } = request.params;

        logger.info('Fetching code details', { code });

        const boothCode = await db
          .select()
          .from(boothCodes)
          .where(eq(boothCodes.code, code))
          .get();

        if (!boothCode) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Code not found',
          });
        }

        // If code was used, fetch the associated session
        let session = null;
        if (boothCode.usedBySessionId) {
          session = await db
            .select()
            .from(sessions)
            .where(eq(sessions.id, boothCode.usedBySessionId))
            .get();
        }

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            code: boothCode,
            session,
          },
        });
      } catch (error) {
        logger.error('Failed to fetch code details', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch code details',
        });
      }
    }
  );

  /**
   * DELETE /api/admin/codes/:code
   * Invalidate/delete a code (only if not used)
   */
  fastify.delete(
    '/api/admin/codes/:code',
    async (
      request: FastifyRequest<{ Params: { code: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { code } = request.params;

        logger.info('Deleting booth code', { code });

        const boothCode = await db
          .select()
          .from(boothCodes)
          .where(eq(boothCodes.code, code))
          .get();

        if (!boothCode) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Code not found',
          });
        }

        if (boothCode.status === 'used') {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            message: 'Cannot delete used code',
          });
        }

        await db.delete(boothCodes).where(eq(boothCodes.id, boothCode.id)).run();

        logger.info('Booth code deleted', { code });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Code deleted successfully',
        });
      } catch (error) {
        logger.error('Failed to delete code', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to delete code',
        });
      }
    }
  );

  /**
   * POST /api/admin/packages
   * Create a new package
   */
  fastify.post(
    ENDPOINTS.ADMIN_PACKAGES,
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          photoCount: number;
          price: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { name, description, photoCount, price } = request.body;

        logger.info('Creating package', { name });

        const packageId = nanoid();
        const newPackage = {
          id: packageId,
          name,
          description: description || null,
          photoCount,
          price,
          currency: 'IDR',
          isActive: true,
          displayOrder: 99, // Put new packages at the end
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await db.insert(packages).values(newPackage).run();

        logger.info('Package created', { packageId });

        return reply.code(HTTP_STATUS.CREATED).send({
          success: true,
          message: 'Package created successfully',
          data: newPackage,
        });
      } catch (error) {
        logger.error('Failed to create package', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to create package',
        });
      }
    }
  );

  /**
   * PUT /api/admin/packages/:id
   * Update a package
   */
  fastify.put(
    `${ENDPOINTS.ADMIN_PACKAGES}/:id`,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          description?: string;
          photoCount?: number;
          price?: number;
          isActive?: boolean;
          displayOrder?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const updates = request.body;

        logger.info('Updating package', { id });

        // Check if package exists
        const existingPackage = await db
          .select()
          .from(packages)
          .where(eq(packages.id, id))
          .get();

        if (!existingPackage) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Package not found',
          });
        }

        // Update package
        await db
          .update(packages)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(packages.id, id))
          .run();

        // Fetch updated package
        const updatedPackage = await db
          .select()
          .from(packages)
          .where(eq(packages.id, id))
          .get();

        logger.info('Package updated', { id });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Package updated successfully',
          data: updatedPackage,
        });
      } catch (error) {
        logger.error('Failed to update package', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to update package',
        });
      }
    }
  );

  /**
   * DELETE /api/admin/packages/:id
   * Delete a package
   */
  fastify.delete(
    `${ENDPOINTS.ADMIN_PACKAGES}/:id`,
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;

        logger.info('Deleting package', { id });

        // Check if package exists
        const existingPackage = await db
          .select()
          .from(packages)
          .where(eq(packages.id, id))
          .get();

        if (!existingPackage) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Package not found',
          });
        }

        // Delete package
        await db.delete(packages).where(eq(packages.id, id)).run();

        logger.info('Package deleted', { id });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Package deleted successfully',
        });
      } catch (error) {
        logger.error('Failed to delete package', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to delete package',
        });
      }
    }
  );
}

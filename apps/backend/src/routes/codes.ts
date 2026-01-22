import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db';
import { boothCodes } from '../db/schema';
import { eq } from 'drizzle-orm';
import { HTTP_STATUS } from '@photonic/config';
import { logger } from '@photonic/utils';

/**
 * Code Verification Routes
 * Handles booth code verification for customer-facing kiosk
 */
export async function codeRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/codes/verify
   * Verify a 4-digit booth code without consuming it
   */
  fastify.post(
    '/api/codes/verify',
    async (
      request: FastifyRequest<{
        Body: {
          code: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { code } = request.body;

        logger.info('Verifying booth code', { code });

        // Validate format
        if (!/^\d{4}$/.test(code)) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            message: 'Code must be 4 digits',
          });
        }

        // Check if code exists and is available
        const boothCode = await db
          .select()
          .from(boothCodes)
          .where(eq(boothCodes.code, code))
          .get();

        if (!boothCode || boothCode.status !== 'generated') {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Invalid or already used code',
          });
        }

        logger.info('Code verified successfully', { code });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: { valid: true },
        });
      } catch (error) {
        logger.error('Failed to verify code', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to verify code',
        });
      }
    }
  );
}

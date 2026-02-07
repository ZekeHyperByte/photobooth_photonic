import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { db } from '../db';
import { sessions, packages, boothCodes, templates } from '../db/schema';
import { eq } from 'drizzle-orm';
import { ENDPOINTS, HTTP_STATUS, MESSAGES } from '@photonic/config';
import { logger } from '@photonic/utils';
import { nanoid } from 'nanoid';
import type { SessionStatus } from '@photonic/types';
import { env } from '../config/env';

/**
 * Session Routes
 * Handles customer session creation and management
 */
export async function sessionRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/sessions
   * Create a new customer session with booth code verification
   */
  fastify.post(
    ENDPOINTS.SESSIONS,
    async (
      request: FastifyRequest<{
        Body: {
          code?: string; // NEW: 4-digit booth code
          packageId?: string; // LEGACY: For backward compatibility
          phoneNumber?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { code, packageId, phoneNumber } = request.body;

        // New code-based flow
        if (code) {
          logger.info('Creating new session with booth code', { code, phoneNumber });

          // 1. Verify code exists and is unused
          const boothCode = await db
            .select()
            .from(boothCodes)
            .where(eq(boothCodes.code, code))
            .get();

          if (!boothCode || boothCode.status !== 'generated') {
            return reply.code(HTTP_STATUS.BAD_REQUEST).send({
              success: false,
              message: 'Invalid or already used code',
            });
          }

          // 2. Get first available package as default (required for DB constraint)
          const defaultPackage = await db.select().from(packages).limit(1).get();

          if (!defaultPackage) {
            return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
              success: false,
              message: 'No packages available. Please create a package first.',
            });
          }

          // 3. Get first active template
          const defaultTemplate = await db
            .select()
            .from(templates)
            .where(eq(templates.isActive, true))
            .limit(1)
            .get();

          if (!defaultTemplate) {
            return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
              success: false,
              message: 'No templates available. Please run the seed script first.',
            });
          }

          // 4. Create session with hardcoded config
          const sessionId = nanoid();
          const newSession = {
            id: sessionId,
            packageId: defaultPackage.id, // Use default package (DB constraint)
            boothCodeId: boothCode.id,
            status: 'paid' as SessionStatus, // Skip payment - go straight to capture
            phoneNumber: phoneNumber || null,
            startedAt: new Date(),
            completedAt: null,
            metadata: {
              hardcodedConfig: {
                photoCount: 3, // Always 3 photos
                templateId: defaultTemplate.id,
                printSize: 'A3',
              },
            },
          };

          await db.insert(sessions).values(newSession).run();

          // 5. Mark code as used
          await db
            .update(boothCodes)
            .set({
              status: 'used',
              usedAt: new Date(),
              usedBySessionId: sessionId,
            })
            .where(eq(boothCodes.id, boothCode.id))
            .run();

          logger.info(`Session created with code: ${code}`, { sessionId });

          return reply.code(HTTP_STATUS.CREATED).send({
            success: true,
            message: MESSAGES.SUCCESS.SESSION_CREATED,
            data: newSession,
          });
        }

        // LEGACY: Package-based flow (for backward compatibility)
        if (packageId) {
          logger.info('Creating new session (legacy package flow)', { packageId, phoneNumber });

          // Verify package exists and is active
          const packageData = await db
            .select()
            .from(packages)
            .where(eq(packages.id, packageId))
            .get();

          if (!packageData) {
            return reply.code(HTTP_STATUS.NOT_FOUND).send({
              success: false,
              message: 'Package not found',
            });
          }

          if (!packageData.isActive) {
            return reply.code(HTTP_STATUS.BAD_REQUEST).send({
              success: false,
              message: 'Package is not active',
            });
          }

          // Create new session
          const sessionId = nanoid();

          // In DEV_MODE, auto-mark session as 'paid' to bypass payment
          const initialStatus: SessionStatus = env.devMode ? 'paid' : 'awaiting_payment';

          const newSession = {
            id: sessionId,
            packageId,
            boothCodeId: null,
            status: initialStatus,
            phoneNumber: phoneNumber || null,
            startedAt: new Date(),
            completedAt: null,
            metadata: null,
          };

          await db.insert(sessions).values(newSession).run();

          if (env.devMode) {
            logger.info('Session created with DEV_MODE bypass (auto-paid)', { sessionId });
          } else {
            logger.info('Session created', { sessionId });
          }

          return reply.code(HTTP_STATUS.CREATED).send({
            success: true,
            message: MESSAGES.SUCCESS.SESSION_CREATED,
            data: newSession,
          });
        }

        // Neither code nor packageId provided
        return reply.code(HTTP_STATUS.BAD_REQUEST).send({
          success: false,
          message: 'Either code or packageId must be provided',
        });
      } catch (error) {
        logger.error('Failed to create session', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to create session',
        });
      }
    }
  );

  /**
   * GET /api/sessions/:id
   * Get session details by ID
   */
  fastify.get(
    `${ENDPOINTS.SESSIONS}/:id`,
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Fetching session', { id });

        const session = await db
          .select()
          .from(sessions)
          .where(eq(sessions.id, id))
          .get();

        if (!session) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Session not found',
          });
        }

        // Get package details
        const packageData = await db
          .select()
          .from(packages)
          .where(eq(packages.id, session.packageId))
          .get();

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            ...session,
            package: packageData,
          },
        });
      } catch (error) {
        logger.error('Failed to fetch session', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch session',
        });
      }
    }
  );

  /**
   * PATCH /api/sessions/:id
   * Update session status or details
   */
  fastify.patch(
    `${ENDPOINTS.SESSIONS}/:id`,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          status?: SessionStatus;
          phoneNumber?: string;
          metadata?: any;
          templateId?: string; // Allow selecting a template for the session
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        const { status, phoneNumber, metadata, templateId } = request.body;

        logger.info('Updating session', { id, status, templateId });

        // Check if session exists
        const existingSession = await db
          .select()
          .from(sessions)
          .where(eq(sessions.id, id))
          .get();

        if (!existingSession) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Session not found',
          });
        }

        // Build update object
        const updates: any = {};
        if (status) updates.status = status;
        if (phoneNumber !== undefined) updates.phoneNumber = phoneNumber;

        // If templateId is provided, update the session metadata with template info
        if (templateId) {
          // Fetch template to get photoCount
          const template = await db
            .select()
            .from(templates)
            .where(eq(templates.id, templateId))
            .get();

          if (!template) {
            return reply.code(HTTP_STATUS.NOT_FOUND).send({
              success: false,
              message: 'Template not found',
            });
          }

          // Merge with existing metadata
          const existingMetadata = existingSession.metadata as Record<string, any> || {};
          updates.metadata = {
            ...existingMetadata,
            hardcodedConfig: {
              ...existingMetadata.hardcodedConfig,
              templateId: template.id,
              photoCount: template.photoCount || 3,
              canvasWidth: template.canvasWidth || 3508,
              canvasHeight: template.canvasHeight || 4960,
            },
          };

          logger.info('Session template updated', {
            sessionId: id,
            templateId: template.id,
            photoCount: template.photoCount,
          });
        } else if (metadata !== undefined) {
          updates.metadata = metadata;
        }

        // If status is being set to completed, set completedAt
        if (status === 'completed') {
          updates.completedAt = new Date();
        }

        // Update session
        await db
          .update(sessions)
          .set(updates)
          .where(eq(sessions.id, id))
          .run();

        // Fetch updated session
        const updatedSession = await db
          .select()
          .from(sessions)
          .where(eq(sessions.id, id))
          .get();

        logger.info('Session updated', { id });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Session updated successfully',
          data: updatedSession,
        });
      } catch (error) {
        logger.error('Failed to update session', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to update session',
        });
      }
    }
  );
}

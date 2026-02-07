import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db';
import { templates } from '../db/schema';
import { eq } from 'drizzle-orm';
import { createTemplateSchema, updateTemplateSchema } from '@photonic/utils';
import { ENDPOINTS, HTTP_STATUS, MESSAGES, detectPaperSize, validatePaperSizeMatch } from '@photonic/config';
import { logger } from '@photonic/utils';
import { imageProcessor } from '../services/image-processor';
import type {
  CreateTemplateRequest,
  UpdateTemplateRequest,
} from '@photonic/types';

/**
 * Template Management Routes
 * Handles CRUD operations for photo templates
 */
export async function templateRoutes(fastify: FastifyInstance) {
  const templatesDir = path.join(process.cwd(), 'data', 'templates');
  const thumbnailsDir = path.join(process.cwd(), 'data', 'thumbnails');
  const previewsDir = path.join(process.cwd(), 'data', 'previews');

  // Ensure directories exist
  await fs.mkdir(templatesDir, { recursive: true });
  await fs.mkdir(thumbnailsDir, { recursive: true });
  await fs.mkdir(previewsDir, { recursive: true });

  /**
   * GET /api/templates
   * List all templates (supports ?active=true filter)
   */
  fastify.get(
    ENDPOINTS.TEMPLATES,
    async (
      request: FastifyRequest<{ Querystring: { active?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { active } = request.query;
        logger.info('Fetching templates', { active });

        let query = db.query.templates;
        let allTemplates;

        if (active === 'true') {
          // Filter for active templates only
          allTemplates = await query.findMany({
            where: eq(templates.isActive, true),
            orderBy: (templates, { asc }) => [asc(templates.displayOrder)],
          });
        } else {
          // Get all templates
          allTemplates = await query.findMany({
            orderBy: (templates, { asc }) => [asc(templates.displayOrder)],
          });
        }

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: allTemplates,
        });
      } catch (error) {
        logger.error('Failed to fetch templates', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch templates',
        });
      }
    }
  );

  /**
   * GET /api/templates/:id
   * Get single template
   */
  fastify.get(
    `${ENDPOINTS.TEMPLATES}/:id`,
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Fetching template', { id });

        const template = await db.query.templates.findFirst({
          where: eq(templates.id, id),
        });

        if (!template) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Template not found',
          });
        }

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: template,
        });
      } catch (error) {
        logger.error('Failed to fetch template', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch template',
        });
      }
    }
  );

  /**
   * GET /api/templates/:id/preview
   * Get template preview image (template applied to sample photo)
   */
  fastify.get(
    `${ENDPOINTS.TEMPLATES}/:id/preview`,
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Fetching template preview', { id });

        const template = await db.query.templates.findFirst({
          where: eq(templates.id, id),
        });

        if (!template) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            error: 'Template not found',
          });
        }

        // Use preview if available, otherwise fall back to thumbnail, then to original file
        const imagePath = template.previewPath || template.thumbnailPath || template.filePath;

        try {
          await fs.access(imagePath);
        } catch {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            error: 'Preview image file not found',
          });
        }

        // Use updatedAt as ETag for cache validation
        const etag = `"${template.updatedAt.getTime()}"`;
        const ifNoneMatch = request.headers['if-none-match'];
        if (ifNoneMatch === etag) {
          return reply.code(304).send();
        }

        // Read and serve the image file
        const imageBuffer = await fs.readFile(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

        return reply
          .code(HTTP_STATUS.OK)
          .header('Content-Type', contentType)
          .header('Cache-Control', 'no-cache')
          .header('ETag', etag)
          .send(imageBuffer);
      } catch (error) {
        logger.error('Failed to fetch template preview', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Failed to fetch preview',
        });
      }
    }
  );

  /**
   * GET /api/templates/:id/thumbnail
   * Get template thumbnail image
   */
  fastify.get(
    `${ENDPOINTS.TEMPLATES}/:id/thumbnail`,
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Fetching template thumbnail', { id });

        const template = await db.query.templates.findFirst({
          where: eq(templates.id, id),
        });

        if (!template) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            error: 'Template not found',
          });
        }

        // Use thumbnail if available, otherwise fall back to original file
        const imagePath = template.thumbnailPath || template.filePath;

        try {
          await fs.access(imagePath);
        } catch {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            error: 'Thumbnail image file not found',
          });
        }

        // Use updatedAt as ETag for cache validation
        const etag = `"${template.updatedAt.getTime()}"`;
        const ifNoneMatch = request.headers['if-none-match'];
        if (ifNoneMatch === etag) {
          return reply.code(304).send();
        }

        // Read and serve the image file
        const imageBuffer = await fs.readFile(imagePath);
        const ext = path.extname(imagePath).toLowerCase();
        const contentType = ext === '.png' ? 'image/png' : 'image/jpeg';

        return reply
          .code(HTTP_STATUS.OK)
          .header('Content-Type', contentType)
          .header('Cache-Control', 'no-cache')
          .header('ETag', etag)
          .send(imageBuffer);
      } catch (error) {
        logger.error('Failed to fetch template thumbnail', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          error: 'Failed to fetch thumbnail',
        });
      }
    }
  );

  /**
   * POST /api/templates/upload-frame
   * Upload a frame image file without creating a full template
   * Returns the file path for use in the frame designer
   */
  fastify.post(
    `${ENDPOINTS.TEMPLATES}/upload-frame`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Uploading frame image');

        // Handle multipart form data
        const data = await request.file();

        if (!data) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            message: 'No file uploaded',
          });
        }

        // Validate file type
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
        if (!allowedTypes.includes(data.mimetype)) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            message: 'Invalid file type. Only PNG and JPEG are allowed.',
          });
        }

        // Save uploaded file
        const frameId = nanoid();
        const fileExtension = path.extname(data.filename) || '.png';
        const frameFilename = `frame-${frameId}${fileExtension}`;
        const framePath = path.join(templatesDir, frameFilename);

        const buffer = await data.toBuffer();
        await fs.writeFile(framePath, buffer);

        // Get image dimensions
        const metadata = await imageProcessor.getImageMetadata(framePath);
        const canvasWidth = metadata?.width || 3508;
        const canvasHeight = metadata?.height || 4960;

        // Auto-detect paper size from dimensions
        const detectedPaperSize = detectPaperSize(canvasWidth, canvasHeight);

        logger.info('Frame image uploaded with detected paper size', {
          frameId,
          framePath,
          canvasWidth,
          canvasHeight,
          detectedPaperSize,
        });

        // Create initial template record in database
        // This allows the updateTemplate endpoint to work when user saves the template
        await db.insert(templates).values({
          id: frameId,
          name: '', // Will be updated when user saves
          filePath: framePath,
          templateType: 'frame',
          canvasWidth,
          canvasHeight,
          paperSize: detectedPaperSize,
          isActive: false, // Not active until properly saved
          displayOrder: 0,
        });

        logger.info('Frame image uploaded successfully', { frameId, framePath });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: {
            frameId,
            filePath: framePath,
            filename: frameFilename,
            width: canvasWidth,
            height: canvasHeight,
            detectedPaperSize,
          },
        });
      } catch (error) {
        logger.error('Failed to upload frame image', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to upload frame image',
        });
      }
    }
  );

  /**
   * POST /api/templates
   * Upload new template
   */
  fastify.post(
    ENDPOINTS.TEMPLATES,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        logger.info('Creating new template');

        // Handle multipart form data
        const data = await request.file();

        if (!data) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            message: 'No file uploaded',
          });
        }

        // Parse form fields
        const fields: any = {};
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'field') {
            fields[part.fieldname] = part.value;
          }
        }

        // Validate request data
        const validatedData = createTemplateSchema.parse({
          name: fields.name,
          description: fields.description,
          templateType: fields.templateType,
          positionData: fields.positionData
            ? JSON.parse(fields.positionData)
            : undefined,
          displayOrder: fields.displayOrder
            ? parseInt(fields.displayOrder)
            : undefined,
        });

        // Save uploaded file
        const templateId = nanoid();
        const fileExtension = path.extname(data.filename);
        const templateFilename = `template-${templateId}${fileExtension}`;
        const templatePath = path.join(templatesDir, templateFilename);

        const buffer = await data.toBuffer();
        await fs.writeFile(templatePath, buffer);

        // Generate thumbnail
        const thumbnailFilename = `thumb-${templateId}.jpg`;
        const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
        await imageProcessor.generateThumbnail(templatePath, thumbnailPath);

        // Generate preview (template with sample photo applied)
        const previewFilename = `preview-${templateId}.jpg`;
        const previewPath = path.join(previewsDir, previewFilename);
        await imageProcessor.generateTemplatePreview(
          templatePath,
          validatedData.templateType as 'overlay' | 'frame' | 'background',
          validatedData.positionData || null,
          previewPath
        );

        // Calculate photoCount from positionData if available
        let photoCount = 3; // Default to 3
        let canvasWidth = 3508; // Default A3 width
        let canvasHeight = 4960; // Default A3 height

        if (validatedData.positionData) {
          const posData = validatedData.positionData as any;
          if (posData.photoZones && Array.isArray(posData.photoZones)) {
            photoCount = posData.photoZones.length;
          }
          if (posData.canvasWidth) {
            canvasWidth = posData.canvasWidth;
          }
          if (posData.canvasHeight) {
            canvasHeight = posData.canvasHeight;
          }
        }

        // Create template record
        const newTemplate = {
          id: templateId,
          name: validatedData.name,
          description: validatedData.description || null,
          filePath: templatePath,
          thumbnailPath: thumbnailPath,
          previewPath: previewPath,
          templateType: validatedData.templateType,
          positionData: validatedData.positionData
            ? JSON.stringify(validatedData.positionData)
            : null,
          photoCount,
          canvasWidth,
          canvasHeight,
          displayOrder: validatedData.displayOrder || 0,
          isActive: true,
        };

        await db.insert(templates).values(newTemplate as any);

        logger.info('Template created successfully', { templateId });

        return reply.code(HTTP_STATUS.CREATED).send({
          success: true,
          message: MESSAGES.SUCCESS.TEMPLATE_UPLOADED,
          data: newTemplate,
        });
      } catch (error) {
        logger.error('Failed to create template', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to create template',
        });
      }
    }
  );

  /**
   * PUT /api/templates/:id
   * Update template
   */
  fastify.put(
    `${ENDPOINTS.TEMPLATES}/:id`,
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Updating template', { id });

        // Check if template exists
        const existingTemplate = await db.query.templates.findFirst({
          where: eq(templates.id, id),
        });

        if (!existingTemplate) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Template not found',
          });
        }

        // Validate request body
        const validatedData = updateTemplateSchema.parse(request.body);

        // Calculate photoCount from positionData if available
        const updates: any = {
          name: validatedData.name,
          description: validatedData.description || null,
          displayOrder: validatedData.displayOrder,
          isActive: validatedData.isActive,
          updatedAt: new Date(),
        };

        if (validatedData.positionData) {
          updates.positionData = JSON.stringify(validatedData.positionData);
          const posData = validatedData.positionData as any;
          if (posData.photoZones && Array.isArray(posData.photoZones)) {
            updates.photoCount = posData.photoZones.length;
          }
          if (posData.canvasWidth) {
            updates.canvasWidth = posData.canvasWidth;
          }
          if (posData.canvasHeight) {
            updates.canvasHeight = posData.canvasHeight;
          }
        }

        // Handle paper size update
        const rawBody = request.body as Record<string, any>;
        if (rawBody.paperSize !== undefined) {
          const paperSize = rawBody.paperSize as import('@photonic/types').PaperSize;
          const canvasWidth = updates.canvasWidth || existingTemplate.canvasWidth;
          const canvasHeight = updates.canvasHeight || existingTemplate.canvasHeight;

          // Validate paper size matches dimensions (log warning but allow)
          const validation = validatePaperSizeMatch(paperSize, canvasWidth, canvasHeight);
          if (!validation.valid && paperSize !== 'CUSTOM') {
            logger.warn('Paper size mismatch detected', {
              templateId: id,
              paperSize,
              canvasWidth,
              canvasHeight,
              message: validation.message,
            });
            // Allow but log warning - admin may have specific reasons
          }

          updates.paperSize = paperSize;
          logger.info('Updating template paper size', {
            templateId: id,
            paperSize,
            canvasWidth,
            canvasHeight,
          });
        }

        // Generate thumbnail and preview if missing
        if (!existingTemplate.thumbnailPath && existingTemplate.filePath) {
          try {
            const thumbnailFilename = `thumb-${id}.jpg`;
            const thumbnailPath = path.join(thumbnailsDir, thumbnailFilename);
            await imageProcessor.generateThumbnail(existingTemplate.filePath, thumbnailPath);
            updates.thumbnailPath = thumbnailPath;
            logger.info('Generated thumbnail for template', { id, thumbnailPath });
          } catch (error) {
            logger.warn('Failed to generate thumbnail', {
              id,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        if (existingTemplate.filePath && (validatedData.positionData || !existingTemplate.previewPath)) {
          try {
            const previewFilename = `preview-${id}.jpg`;
            const previewPath = path.join(previewsDir, previewFilename);

            // Get positionData - may already be parsed object from drizzle json mode
            const posData = (validatedData.positionData || existingTemplate.positionData || null) as import('@photonic/types').TemplatePosition | import('@photonic/types').MultiZonePosition | null;

            await imageProcessor.generateTemplatePreview(
              existingTemplate.filePath,
              (existingTemplate.templateType || 'frame') as 'overlay' | 'frame' | 'background',
              posData,
              previewPath
            );
            updates.previewPath = previewPath;
            logger.info('Generated preview for template', { id, previewPath });
          } catch (error) {
            logger.warn('Failed to generate preview (sample-photo.jpg may be missing)', {
              id,
              error: error instanceof Error ? error.message : String(error),
            });
            // If preview generation fails, use the thumbnail as preview fallback
            if (updates.thumbnailPath || existingTemplate.thumbnailPath) {
              updates.previewPath = updates.thumbnailPath || existingTemplate.thumbnailPath;
              logger.info('Using thumbnail as preview fallback', { id });
            }
          }
        }

        // Update template record
        await db
          .update(templates)
          .set(updates)
          .where(eq(templates.id, id));

        logger.info('Template updated successfully', { id });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: MESSAGES.SUCCESS.TEMPLATE_UPDATED,
        });
      } catch (error) {
        logger.error('Failed to update template', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to update template',
        });
      }
    }
  );

  /**
   * DELETE /api/templates/:id
   * Delete template
   */
  fastify.delete(
    `${ENDPOINTS.TEMPLATES}/:id`,
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = request.params;
        logger.info('Deleting template', { id });

        // Get template to delete files
        const template = await db.query.templates.findFirst({
          where: eq(templates.id, id),
        });

        if (!template) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Template not found',
          });
        }

        // Delete files
        try {
          await fs.unlink(template.filePath);
          if (template.thumbnailPath) {
            await fs.unlink(template.thumbnailPath);
          }
        } catch (error) {
          logger.warn('Failed to delete template files', {
            error: error instanceof Error ? error.message : String(error),
          });
        }

        // Delete database record
        await db.delete(templates).where(eq(templates.id, id));

        logger.info('Template deleted successfully', { id });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: MESSAGES.SUCCESS.TEMPLATE_DELETED,
        });
      } catch (error) {
        logger.error('Failed to delete template', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to delete template',
        });
      }
    }
  );

  logger.info('Template routes registered');
}

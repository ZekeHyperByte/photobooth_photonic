import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import path from 'path';
import fs from 'fs/promises';
import { db } from '../db';
import { photos, sessions, filters } from '../db/schema';
import { eq, inArray } from 'drizzle-orm';
import { HTTP_STATUS, MESSAGES, ENDPOINTS } from '@photonic/config';
import { logger } from '@photonic/utils';
import { imageProcessor } from '../services/image-processor';
import { getCameraService } from '../services/camera-service';
import type {
  CapturePhotoRequest,
  ProcessPhotoRequest,
} from '@photonic/types';

/**
 * Photo Routes
 * Handles photo capture and processing
 */
export async function photoRoutes(fastify: FastifyInstance) {
  const photosDir = path.join(process.cwd(), 'data', 'photos');
  const processedDir = path.join(process.cwd(), 'data', 'processed');

  // Ensure directories exist
  await fs.mkdir(photosDir, { recursive: true });
  await fs.mkdir(processedDir, { recursive: true });

  /**
   * POST /api/photos/capture
   * Capture photo from camera via bridge service
   */
  fastify.post(
    `${ENDPOINTS.PHOTOS}/capture`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as CapturePhotoRequest & {
          sequenceNumber?: number;
          retakePhotoId?: string;
        };
        logger.info('Capturing photo', {
          sessionId: body.sessionId,
          sequenceNumber: body.sequenceNumber,
          retakePhotoId: body.retakePhotoId,
        });

        // Verify session exists
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, body.sessionId),
        });

        if (!session) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Session not found',
          });
        }

        // Use local camera service to capture photo
        const cameraService = getCameraService();

        // Initialize camera if not already done
        if (!cameraService.isConnected()) {
          await cameraService.initialize();
        }

        // Use provided sequence number or calculate based on existing photos
        let sequenceNumber = body.sequenceNumber;
        if (!sequenceNumber) {
          const existingPhotos = await db.query.photos.findMany({
            where: eq(photos.sessionId, body.sessionId),
          });
          sequenceNumber = existingPhotos.filter((p) => p.sequenceNumber <= 3).length + 1;
        }

        // Capture photo using local camera service
        const captureResult = await cameraService.capturePhoto(body.sessionId, sequenceNumber);

        // Handle retake mode or new photo
        if (body.retakePhotoId) {
          // Retake mode: Update existing photo
          const existingPhoto = await db.query.photos.findFirst({
            where: eq(photos.id, body.retakePhotoId),
          });

          if (!existingPhoto) {
            return reply.code(HTTP_STATUS.NOT_FOUND).send({
              success: false,
              message: 'Photo to retake not found',
            });
          }

          const originalFilename = `photo-${body.retakePhotoId}-original.jpg`;
          const originalPath = path.join(photosDir, originalFilename);

          // Copy new photo to replace old one
          await fs.copyFile(captureResult.imagePath, originalPath);

          // Update photo record
          await db.update(photos)
            .set({
              originalPath,
              captureTime: new Date().toISOString(),
              metadata: captureResult.metadata as any,
            })
            .where(eq(photos.id, body.retakePhotoId));

          const updatedPhoto = await db.query.photos.findFirst({
            where: eq(photos.id, body.retakePhotoId),
          });

          logger.info('Photo retaken successfully', { photoId: body.retakePhotoId });

          return reply.code(HTTP_STATUS.OK).send({
            success: true,
            message: 'Photo retaken successfully',
            data: {
              photo: updatedPhoto,
              captureUrl: `/data/photos/${originalFilename}`,
            },
          });
        } else {
          // New photo mode
          const photoId = nanoid();
          const originalFilename = `photo-${photoId}-original.jpg`;
          const originalPath = path.join(photosDir, originalFilename);

          // Copy photo from temp directory to photos directory
          await fs.copyFile(captureResult.imagePath, originalPath);

          // Create photo record
          const newPhoto = {
            id: photoId,
            sessionId: body.sessionId,
            originalPath,
            processedPath: null,
            templateId: body.templateId || null,
            filterId: body.filterId || null,
            sequenceNumber,
            captureTime: new Date().toISOString(),
            metadata: captureResult.metadata as any,
          };

          await db.insert(photos).values(newPhoto as any);

          // If template or filter specified, process immediately
          if (body.templateId || body.filterId) {
            await imageProcessor.processPhoto(photoId, {
              templateId: body.templateId,
              filterId: body.filterId,
            });
          }

          logger.info('Photo captured successfully', { photoId });

          return reply.code(HTTP_STATUS.CREATED).send({
            success: true,
            message: MESSAGES.SUCCESS.PHOTO_CAPTURED,
            data: {
              photo: newPhoto,
              captureUrl: `/data/photos/${originalFilename}`,
            },
          });
        }
      } catch (error) {
        logger.error('Failed to capture photo', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to capture photo',
        });
      }
    }
  );

  /**
   * POST /api/photos/upload
   * Upload photo captured from browser webcam
   */
  fastify.post(
    `${ENDPOINTS.PHOTOS}/upload`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as {
          sessionId: string;
          imageData: string; // base64 encoded JPEG
          templateId?: string;
          filterId?: string;
          retakePhotoId?: string; // ID of photo being retaken
        };

        logger.info('Uploading browser-captured photo', {
          sessionId: body.sessionId,
          hasImageData: !!body.imageData,
          imageDataLength: body.imageData?.length || 0,
        });

        // Verify session exists
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, body.sessionId),
        });

        if (!session) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Session not found',
          });
        }

        if (!body.imageData) {
          return reply.code(HTTP_STATUS.BAD_REQUEST).send({
            success: false,
            message: 'No image data provided',
          });
        }

        // Decode base64 image
        const base64Data = body.imageData.replace(/^data:image\/\w+;base64,/, '');
        const imageBuffer = Buffer.from(base64Data, 'base64');

        // Calculate sequence number based on existing raw photos (exclude composites)
        const existingPhotos = await db.query.photos.findMany({
          where: eq(photos.sessionId, body.sessionId),
        });
        // Only count raw photos (sequenceNumber 1-3), not composites (99)
        const rawPhotos = existingPhotos.filter((p) => p.sequenceNumber <= 3);
        const sequenceNumber = rawPhotos.length + 1;

        // Handle retake mode: update existing photo instead of creating new one
        if (body.retakePhotoId) {
          const existingPhoto = existingPhotos.find((p) => p.id === body.retakePhotoId);
          if (!existingPhoto) {
            return reply.code(HTTP_STATUS.NOT_FOUND).send({
              success: false,
              message: 'Photo to retake not found',
            });
          }

          logger.info('Retaking photo', {
            sessionId: body.sessionId,
            retakePhotoId: body.retakePhotoId,
            existingSequence: existingPhoto.sequenceNumber,
          });

          // Generate new filename for the retake
          const retakeFilename = `photo-${body.retakePhotoId}-retake-${Date.now()}.jpg`;
          const retakePath = path.join(photosDir, retakeFilename);

          // Save new image to disk
          await fs.writeFile(retakePath, imageBuffer);

          // Delete old image file (ignore errors if file doesn't exist)
          try {
            await fs.unlink(existingPhoto.originalPath);
          } catch {
            // Old file may not exist, that's ok
          }

          // Update the existing photo record with new path
          await db
            .update(photos)
            .set({
              originalPath: retakePath,
              processedPath: null, // Clear processed path since we have new image
            })
            .where(eq(photos.id, body.retakePhotoId));

          const updatedPhoto = {
            ...existingPhoto,
            originalPath: retakePath,
            processedPath: null,
          };

          logger.info('Photo retake completed', {
            photoId: body.retakePhotoId,
            newPath: retakePath,
          });

          return reply.code(HTTP_STATUS.OK).send({
            success: true,
            message: 'Photo retaken successfully',
            data: {
              photo: updatedPhoto,
              captureUrl: `/data/photos/${retakeFilename}`,
            },
          });
        }

        // If session already has 3 photos and NOT a retake, return the last one as success
        // This prevents retry loops while allowing the frontend to continue
        if (rawPhotos.length >= 3) {
          logger.info('Session already has 3 photos, returning existing photo', {
            sessionId: body.sessionId,
            existingCount: rawPhotos.length,
          });
          const lastPhoto = rawPhotos[rawPhotos.length - 1];
          return reply.code(HTTP_STATUS.OK).send({
            success: true,
            message: 'Photo already captured',
            data: {
              photo: lastPhoto,
              captureUrl: `/data/photos/${path.basename(lastPhoto.originalPath)}`,
            },
          });
        }

        // Generate photo ID and paths
        const photoId = nanoid();
        const originalFilename = `photo-${photoId}-original.jpg`;
        const originalPath = path.join(photosDir, originalFilename);

        // Save image to disk
        await fs.writeFile(originalPath, imageBuffer);

        // Create photo record
        const newPhoto = {
          id: photoId,
          sessionId: body.sessionId,
          sequenceNumber,
          originalPath,
          processedPath: null,
          templateId: body.templateId || null,
          filterId: body.filterId || null,
        };

        await db.insert(photos).values(newPhoto as any);

        // If template or filter specified, process immediately
        if (body.templateId || body.filterId) {
          await imageProcessor.processPhoto(photoId, {
            templateId: body.templateId,
            filterId: body.filterId,
          });
        }

        logger.info('Browser photo uploaded successfully', { photoId });

        return reply.code(HTTP_STATUS.CREATED).send({
          success: true,
          message: MESSAGES.SUCCESS.PHOTO_CAPTURED,
          data: {
            photo: newPhoto,
            captureUrl: `/data/photos/${originalFilename}`,
          },
        });
      } catch (error) {
        logger.error('Failed to upload photo', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to upload photo',
        });
      }
    }
  );

  /**
   * POST /api/photos/:photoId/process
   * Process an existing photo with template and filters
   */
  fastify.post(
    `${ENDPOINTS.PHOTOS}/:photoId/process`,
    async (
      request: FastifyRequest<{ Params: { photoId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { photoId } = request.params;
        const body = request.body as ProcessPhotoRequest;

        logger.info('Processing photo', { photoId, body });

        // Verify photo exists
        const photo = await db.query.photos.findFirst({
          where: eq(photos.id, photoId),
        });

        if (!photo) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Photo not found',
          });
        }

        // Process the photo
        const processedPath = await imageProcessor.processPhoto(photoId, body);

        const processedFilename = path.basename(processedPath);

        logger.info('Photo processed successfully', { photoId, processedPath });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: MESSAGES.SUCCESS.PHOTO_PROCESSED,
          data: {
            photo: { ...photo, processedPath },
            processedUrl: `/data/processed/${processedFilename}`,
          },
        });
      } catch (error) {
        logger.error('Failed to process photo', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to process photo',
        });
      }
    }
  );

  /**
   * POST /api/photos/:photoId/preview-filter
   * Generate filter preview for a specific photo
   */
  fastify.post(
    `${ENDPOINTS.PHOTOS}/:photoId/preview-filter`,
    async (
      request: FastifyRequest<{
        Params: { photoId: string };
        Body: { filterId: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { photoId } = request.params;
        const { filterId } = request.body;

        logger.info('Generating filter preview', { photoId, filterId });

        // Get photo
        const photo = await db.query.photos.findFirst({
          where: eq(photos.id, photoId),
        });

        if (!photo) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Photo not found',
          });
        }

        // If no filter or 'none', return original photo
        if (!filterId || filterId === 'none') {
          const imageBuffer = await fs.readFile(photo.originalPath);
          return reply.type('image/jpeg').send(imageBuffer);
        }

        // Get filter
        const filter = await db.query.filters.findFirst({
          where: eq(filters.id, filterId),
        });

        if (!filter) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Filter not found',
          });
        }

        // Generate preview with filter
        const previewBuffer = await imageProcessor.generatePhotoFilterPreview(
          photo.originalPath,
          filter.filterConfig
        );

        // Return as JPEG image
        return reply.type('image/jpeg').send(previewBuffer);
      } catch (error) {
        logger.error('Failed to generate filter preview', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to generate filter preview',
        });
      }
    }
  );

  /**
   * POST /api/photos/composite-a3
   * Create A3 composite from session photos with newspaper template
   */
  fastify.post(
    `${ENDPOINTS.PHOTOS}/composite-a3`,
    async (
      request: FastifyRequest<{
        Body: {
          sessionId: string;
          templateId: string;
          filterId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const { sessionId, templateId, filterId } = request.body;

        logger.info('Creating A3 composite', {
          sessionId,
          templateId,
          filterId,
        });

        // Verify session exists
        const session = await db.query.sessions.findFirst({
          where: eq(sessions.id, sessionId),
        });

        if (!session) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Session not found',
          });
        }

        // Create the composite
        const compositePhotoId = await imageProcessor.createA3Composite(
          sessionId,
          templateId,
          filterId
        );

        // Fetch the created composite photo record
        const compositePhoto = await db.query.photos.findFirst({
          where: eq(photos.id, compositePhotoId),
        });

        logger.info('A3 composite created successfully', {
          sessionId,
          compositePhotoId,
        });

        return reply.code(HTTP_STATUS.CREATED).send({
          success: true,
          message: 'A3 composite created successfully',
          data: {
            photo: compositePhoto,
            compositeUrl: `/data/processed/${path.basename(compositePhoto!.processedPath!)}`,
          },
        });
      } catch (error) {
        logger.error('Failed to create A3 composite', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to create A3 composite',
        });
      }
    }
  );

  /**
   * GET /api/photos/session/:sessionId
   * Get all photos for a session
   */
  fastify.get(
    `${ENDPOINTS.PHOTOS}/session/:sessionId`,
    async (
      request: FastifyRequest<{ Params: { sessionId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { sessionId } = request.params;
        logger.info('Fetching photos for session', { sessionId });

        const sessionPhotos = await db.query.photos.findMany({
          where: eq(photos.sessionId, sessionId),
          orderBy: (photos, { asc }) => [asc(photos.photoNumber)],
        });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: sessionPhotos,
        });
      } catch (error) {
        logger.error('Failed to fetch session photos', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch session photos',
        });
      }
    }
  );

  /**
   * GET /api/photos/:photoId
   * Get single photo details
   */
  fastify.get(
    `${ENDPOINTS.PHOTOS}/:photoId`,
    async (
      request: FastifyRequest<{ Params: { photoId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { photoId } = request.params;
        logger.info('Fetching photo', { photoId });

        const photo = await db.query.photos.findFirst({
          where: eq(photos.id, photoId),
        });

        if (!photo) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'Photo not found',
          });
        }

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          data: photo,
        });
      } catch (error) {
        logger.error('Failed to fetch photo', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message: 'Failed to fetch photo',
        });
      }
    }
  );

  /**
   * POST /api/photos/collage
   * Create a collage from multiple photos
   */
  fastify.post(
    `${ENDPOINTS.PHOTOS}/collage`,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as {
          photoIds: string[];
          layout?: '2x2' | '3x1' | '4x1';
        };

        logger.info('Creating collage', {
          photoCount: body.photoIds.length,
          layout: body.layout,
        });

        // Fetch all photos in a single query (fix N+1)
        const photoRecords = await db.query.photos.findMany({
          where: inArray(photos.id, body.photoIds),
        });

        // Check if all photos exist
        if (photoRecords.length !== body.photoIds.length) {
          return reply.code(HTTP_STATUS.NOT_FOUND).send({
            success: false,
            message: 'One or more photos not found',
          });
        }

        // Reorder to match requested order
        const orderedPhotos = body.photoIds.map(id =>
          photoRecords.find(p => p.id === id)!
        );

        // Use processed paths if available, otherwise original
        const photoPaths = orderedPhotos.map(
          (p) => p.processedPath || p.originalPath
        );

        // Generate collage
        const collageFilename = `collage-${nanoid()}.jpg`;
        const collagePath = path.join(processedDir, collageFilename);

        await imageProcessor.createCollage(
          photoPaths,
          collagePath,
          body.layout || '2x2'
        );

        logger.info('Collage created successfully', { collagePath });

        return reply.code(HTTP_STATUS.OK).send({
          success: true,
          message: 'Collage created successfully',
          data: {
            collageUrl: `/data/processed/${collageFilename}`,
            collagePath,
          },
        });
      } catch (error) {
        logger.error('Failed to create collage', {
          error: error instanceof Error ? error.message : String(error),
        });

        return reply.code(HTTP_STATUS.INTERNAL_SERVER_ERROR).send({
          success: false,
          message:
            error instanceof Error ? error.message : 'Failed to create collage',
        });
      }
    }
  );

  logger.info('Photo routes registered');
}

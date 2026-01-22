import { nanoid } from 'nanoid';
import { db } from '../db';
import { printQueue, photos } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@photonic/utils';
import type { QueuePrintRequest, PaperSize } from '@photonic/types';

/**
 * Print Service
 * Manages print queue for photo printing
 */
export class PrintService {
  constructor() {
    logger.info('PrintService initialized');
  }

  /**
   * Queue a photo for printing
   */
  async queuePrint(
    photoId: string,
    request: QueuePrintRequest
  ): Promise<string> {
    try {
      logger.info('Queueing print job', { photoId, request });

      // Fetch photo with template to get paper size
      const photo = await db.query.photos.findFirst({
        where: eq(photos.id, photoId),
        with: {
          template: true, // Join template to get paper size
        },
      });

      if (!photo) {
        throw new Error('Photo not found');
      }

      // Use processed photo if available, otherwise original
      const photoPath = photo.processedPath || photo.originalPath;

      // Get paper size from template (default to A3 if no template)
      let paperSize: PaperSize = photo.template?.paperSize || 'A3';

      // Allow override for testing (but only A3/A4, not CUSTOM)
      if (request.paperSize) {
        paperSize = request.paperSize;
        logger.info('Paper size override', {
          templatePaperSize: photo.template?.paperSize,
          overridePaperSize: paperSize,
        });
      }

      // Convert CUSTOM to A3 for printing (CUSTOM frames use nearest standard size)
      const printPaperSize: 'A3' | 'A4' = paperSize === 'CUSTOM' ? 'A3' : paperSize;

      // Generate print job ID
      const printJobId = nanoid();

      // Create print job with paper size
      await db.insert(printQueue).values({
        id: printJobId,
        photoId,
        sessionId: photo.sessionId,
        photoPath,
        copies: request.copies || 1,
        paperSize: printPaperSize, // Store paper size in print queue
        status: 'pending',
        queuedAt: new Date(),
      } as any);

      logger.info('Print job queued successfully', {
        printJobId,
        paperSize: printPaperSize,
        templateId: photo.templateId,
      });

      return printJobId;
    } catch (error) {
      logger.error('Failed to queue print job', {
        error: error instanceof Error ? error.message : String(error),
        photoId,
      });
      throw error;
    }
  }

  /**
   * Get print job status
   */
  async getPrintStatus(printJobId: string): Promise<{
    status: string;
    printedAt: Date | null;
    error: string | null;
  }> {
    try {
      logger.info('Getting print job status', { printJobId });

      const printJob = await db.query.printQueue.findFirst({
        where: eq(printQueue.id, printJobId),
      });

      if (!printJob) {
        throw new Error('Print job not found');
      }

      return {
        status: printJob.status,
        printedAt: printJob.printedAt,
        error: printJob.error,
      };
    } catch (error) {
      logger.error('Failed to get print job status', {
        error: error instanceof Error ? error.message : String(error),
        printJobId,
      });
      throw error;
    }
  }

  /**
   * Get all pending print jobs
   * (Called by Electron app to fetch jobs for printing)
   */
  async getPendingJobs(): Promise<any[]> {
    try {
      logger.info('Fetching pending print jobs');

      const pendingJobs = await db.query.printQueue.findMany({
        where: eq(printQueue.status, 'pending'),
        orderBy: (printQueue, { asc }) => [asc(printQueue.queuedAt)],
      });

      return pendingJobs;
    } catch (error) {
      logger.error('Failed to fetch pending print jobs', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update print job status
   * (Called by Electron app after printing)
   */
  async updatePrintStatus(
    printJobId: string,
    status: 'printing' | 'completed' | 'failed',
    error?: string
  ): Promise<void> {
    try {
      logger.info('Updating print job status', { printJobId, status });

      await db
        .update(printQueue)
        .set({
          status,
          printedAt: status === 'completed' ? new Date() : null,
          error: error || null,
        } as any)
        .where(eq(printQueue.id, printJobId));

      logger.info('Print job status updated', { printJobId, status });
    } catch (error) {
      logger.error('Failed to update print job status', {
        error: error instanceof Error ? error.message : String(error),
        printJobId,
      });
      throw error;
    }
  }

  /**
   * Cancel a print job
   */
  async cancelPrint(printJobId: string): Promise<void> {
    try {
      logger.info('Cancelling print job', { printJobId });

      const printJob = await db.query.printQueue.findFirst({
        where: eq(printQueue.id, printJobId),
      });

      if (!printJob) {
        throw new Error('Print job not found');
      }

      if (printJob.status !== 'pending') {
        throw new Error(
          `Cannot cancel print job with status: ${printJob.status}`
        );
      }

      await db
        .update(printQueue)
        .set({ status: 'cancelled' } as any)
        .where(eq(printQueue.id, printJobId));

      logger.info('Print job cancelled', { printJobId });
    } catch (error) {
      logger.error('Failed to cancel print job', {
        error: error instanceof Error ? error.message : String(error),
        printJobId,
      });
      throw error;
    }
  }

  /**
   * Get print queue for a session
   */
  async getSessionPrintJobs(sessionId: string): Promise<any[]> {
    try {
      logger.info('Fetching print jobs for session', { sessionId });

      // Get all photos for the session
      const sessionPhotos = await db.query.photos.findMany({
        where: eq(photos.sessionId, sessionId),
      });

      const photoIds = sessionPhotos.map((p) => p.id);

      // Get print jobs for these photos
      const jobs = [];
      for (const photoId of photoIds) {
        const photoJobs = await db.query.printQueue.findMany({
          where: eq(printQueue.photoId, photoId),
          orderBy: (printQueue, { desc }) => [desc(printQueue.queuedAt)],
        });
        jobs.push(...photoJobs);
      }

      return jobs;
    } catch (error) {
      logger.error('Failed to fetch session print jobs', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const printService = new PrintService();

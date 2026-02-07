import { nanoid } from 'nanoid';
import { db } from '../db';
import { printQueue, photos } from '../db/schema';
import { eq } from 'drizzle-orm';
import { logger } from '@photonic/utils';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import os from 'os';
import type { QueuePrintRequest, PaperSize } from '@photonic/types';

const execAsync = promisify(exec);

// Platform detection
const isWindows = os.platform() === 'win32';

// CUPS media options for paper sizes (Linux)
const CUPS_MEDIA_OPTIONS: Record<string, string> = {
  A3: 'A3',
  A4: 'A4',
  '4x6': '4x6',
  '5x7': '5x7',
};

/**
 * Print Service
 * Manages print queue and sends jobs to CUPS
 */
export class PrintService {
  private defaultPrinter: string | null = null;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor() {
    logger.info('PrintService initialized');
  }

  /**
   * Start the print queue processor
   */
  async start(): Promise<void> {
    // Detect default printer
    await this.detectDefaultPrinter();

    // Start processing queue every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, 5000);

    logger.info('Print service started', { defaultPrinter: this.defaultPrinter });
  }

  /**
   * Stop the print queue processor
   */
  stop(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    logger.info('Print service stopped');
  }

  /**
   * Detect the default printer
   */
  async detectDefaultPrinter(): Promise<string | null> {
    try {
      if (isWindows) {
        // Windows: Use PowerShell to get default printer
        const { stdout } = await execAsync(
          'powershell -Command "(Get-WmiObject -Query \\"SELECT * FROM Win32_Printer WHERE Default=$true\\").Name"',
          { timeout: 10000 }
        );
        const printerName = stdout.trim();
        if (printerName) {
          this.defaultPrinter = printerName;
          logger.info('Default printer detected (Windows)', { printer: this.defaultPrinter });
          return this.defaultPrinter;
        }
      } else {
        // Linux: Use CUPS lpstat
        const { stdout } = await execAsync('lpstat -d 2>/dev/null || echo "no default"');
        const match = stdout.match(/system default destination: (.+)/);
        if (match) {
          this.defaultPrinter = match[1].trim();
          logger.info('Default printer detected (CUPS)', { printer: this.defaultPrinter });
          return this.defaultPrinter;
        }
      }
    } catch (error) {
      logger.warn('Failed to detect default printer', { error });
    }
    return null;
  }

  /**
   * List all available printers
   */
  async listPrinters(): Promise<Array<{ name: string; status: string; isDefault: boolean }>> {
    try {
      const printers: Array<{ name: string; status: string; isDefault: boolean }> = [];

      if (isWindows) {
        // Windows: Use PowerShell to list printers
        const { stdout } = await execAsync(
          'powershell -Command "Get-WmiObject -Query \\"SELECT Name,PrinterStatus,Default FROM Win32_Printer\\" | ConvertTo-Json"',
          { timeout: 10000 }
        );

        try {
          const parsed = JSON.parse(stdout);
          const printerList = Array.isArray(parsed) ? parsed : [parsed];

          for (const p of printerList) {
            if (p && p.Name) {
              printers.push({
                name: p.Name,
                status: p.PrinterStatus === 3 ? 'idle' : 'unknown',
                isDefault: p.Default === true,
              });
            }
          }
        } catch (parseError) {
          logger.warn('Failed to parse printer list', { parseError });
        }
      } else {
        // Linux: Use CUPS lpstat
        const { stdout } = await execAsync('lpstat -p 2>/dev/null || echo ""');

        const lines = stdout.split('\n').filter((line) => line.startsWith('printer'));
        for (const line of lines) {
          const match = line.match(/printer (\S+) (.+)/);
          if (match) {
            printers.push({
              name: match[1],
              status: match[2].includes('idle') ? 'idle' : match[2].includes('enabled') ? 'enabled' : 'unknown',
              isDefault: match[1] === this.defaultPrinter,
            });
          }
        }
      }

      return printers;
    } catch (error) {
      logger.error('Failed to list printers', { error });
      return [];
    }
  }

  /**
   * Set the default printer for this service
   */
  setDefaultPrinter(printerName: string): void {
    this.defaultPrinter = printerName;
    logger.info('Default printer set', { printer: printerName });
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

      // Verify file exists
      if (!fs.existsSync(photoPath)) {
        throw new Error(`Photo file not found: ${photoPath}`);
      }

      // Get paper size from template (default to A3 if no template)
      let paperSize: PaperSize = (photo.template?.paperSize as PaperSize) || 'A3';

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

      // Trigger immediate processing
      this.processQueue();

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
   * Process pending print jobs
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const pendingJobs = await db.query.printQueue.findMany({
        where: eq(printQueue.status, 'pending'),
        orderBy: (printQueue, { asc }) => [asc(printQueue.queuedAt)],
      });

      for (const job of pendingJobs) {
        await this.printJob(job);
      }
    } catch (error) {
      logger.error('Error processing print queue', { error });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Send a job to the printer
   */
  private async printJob(job: any): Promise<void> {
    const { id, photoPath, copies, paperSize } = job;

    try {
      // Update status to printing
      await db
        .update(printQueue)
        .set({ status: 'printing' } as any)
        .where(eq(printQueue.id, id));

      logger.info('Printing job', { id, photoPath, copies, paperSize, platform: isWindows ? 'Windows' : 'Linux' });

      // Verify file still exists
      if (!fs.existsSync(photoPath)) {
        throw new Error(`Photo file not found: ${photoPath}`);
      }

      if (isWindows) {
        await this.printJobWindows(photoPath, copies, paperSize);
      } else {
        await this.printJobLinux(photoPath, copies, paperSize);
      }

      // Update status to completed
      await db
        .update(printQueue)
        .set({
          status: 'completed',
          printedAt: new Date(),
        } as any)
        .where(eq(printQueue.id, id));

      logger.info('Print job completed', { id });
    } catch (error: any) {
      logger.error('Print job failed', {
        id,
        error: error.message || String(error),
      });

      // Update retry count
      const currentRetries = job.retryCount || 0;
      const maxRetries = 3;

      if (currentRetries < maxRetries) {
        // Retry later
        await db
          .update(printQueue)
          .set({
            status: 'pending',
            retryCount: currentRetries + 1,
            errorMessage: error.message || String(error),
          } as any)
          .where(eq(printQueue.id, id));

        logger.info('Print job will retry', { id, retryCount: currentRetries + 1 });
      } else {
        // Mark as failed after max retries
        await db
          .update(printQueue)
          .set({
            status: 'failed',
            errorMessage: error.message || String(error),
          } as any)
          .where(eq(printQueue.id, id));

        logger.error('Print job failed permanently', { id, retries: currentRetries });
      }
    }
  }

  /**
   * Print job on Windows using PowerShell
   */
  private async printJobWindows(photoPath: string, copies: number, paperSize: string): Promise<void> {
    const printerArg = this.defaultPrinter ? `-PrinterName "${this.defaultPrinter}"` : '';

    // Print each copy using PowerShell Start-Process with Print verb
    for (let i = 0; i < copies; i++) {
      // Method 1: Use Start-Process with Print verb (works for images)
      const psCommand = `powershell -Command "Start-Process -FilePath '${photoPath.replace(/'/g, "''")}' -Verb Print ${printerArg ? `-ArgumentList '${this.defaultPrinter}'` : ''} -Wait"`;

      logger.info('Executing Windows print command', { command: psCommand, copy: i + 1 });

      try {
        await execAsync(psCommand, { timeout: 60000 });
      } catch (error: any) {
        // Try alternative method using mspaint
        logger.warn('Start-Process print failed, trying mspaint method');
        const altCommand = `mspaint /p "${photoPath}"`;
        await execAsync(altCommand, { timeout: 60000 });
      }
    }

    logger.info('Windows print job sent', { copies, printer: this.defaultPrinter });
  }

  /**
   * Print job on Linux using CUPS
   */
  private async printJobLinux(photoPath: string, copies: number, paperSize: string): Promise<void> {
    const printerArg = this.defaultPrinter ? `-d "${this.defaultPrinter}"` : '';
    const mediaOption = CUPS_MEDIA_OPTIONS[paperSize] || 'A3';

    // CUPS options for photo printing:
    // -o media=SIZE : Paper size
    // -o fit-to-page : Scale image to fit page
    // -o print-quality=5 : High quality (5 = best)
    // -n COPIES : Number of copies
    const lpCommand = `lp ${printerArg} -o media=${mediaOption} -o fit-to-page -o print-quality=5 -n ${copies} "${photoPath}"`;

    logger.info('Executing CUPS print command', { command: lpCommand });

    const { stdout, stderr } = await execAsync(lpCommand, { timeout: 30000 });

    if (stderr && !stderr.includes('request id')) {
      logger.warn('Print command stderr', { stderr });
    }

    // Extract CUPS job ID from output
    const cupsJobMatch = stdout.match(/request id is (\S+)/);
    const cupsJobId = cupsJobMatch ? cupsJobMatch[1] : null;

    logger.info('CUPS print job sent', { cupsJobId, stdout: stdout.trim() });
  }

  /**
   * Print directly without queueing (for testing)
   */
  async printDirect(filePath: string, options?: {
    printer?: string;
    copies?: number;
    paperSize?: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      const printer = options?.printer || this.defaultPrinter;
      const copies = options?.copies || 1;
      const paperSize = options?.paperSize || 'A3';

      if (isWindows) {
        // Windows: Use PowerShell
        for (let i = 0; i < copies; i++) {
          const psCommand = printer
            ? `powershell -Command "Start-Process -FilePath '${filePath.replace(/'/g, "''")}' -Verb Print -Wait"`
            : `powershell -Command "Start-Process -FilePath '${filePath.replace(/'/g, "''")}' -Verb Print -Wait"`;

          await execAsync(psCommand, { timeout: 60000 });
        }

        return {
          success: true,
          message: `Printed ${copies} copy(ies) to ${printer || 'default printer'}`,
        };
      } else {
        // Linux: Use CUPS
        const printerArg = printer ? `-d "${printer}"` : '';
        const mediaOption = CUPS_MEDIA_OPTIONS[paperSize] || paperSize;

        const lpCommand = `lp ${printerArg} -o media=${mediaOption} -o fit-to-page -o print-quality=5 -n ${copies} "${filePath}"`;

        logger.info('Direct print command', { command: lpCommand });

        const { stdout } = await execAsync(lpCommand, { timeout: 30000 });

        return {
          success: true,
          message: stdout.trim(),
        };
      }
    } catch (error: any) {
      logger.error('Direct print failed', { error: error.message });
      return {
        success: false,
        message: error.message || String(error),
      };
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
        error: printJob.errorMessage || null,
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
          errorMessage: error || null,
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

      const jobs = await db.query.printQueue.findMany({
        where: eq(printQueue.sessionId, sessionId),
        orderBy: (printQueue, { desc }) => [desc(printQueue.queuedAt)],
      });

      return jobs;
    } catch (error) {
      logger.error('Failed to fetch session print jobs', {
        error: error instanceof Error ? error.message : String(error),
        sessionId,
      });
      throw error;
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    isRunning: boolean;
    defaultPrinter: string | null;
    isProcessing: boolean;
  } {
    return {
      isRunning: this.processingInterval !== null,
      defaultPrinter: this.defaultPrinter,
      isProcessing: this.isProcessing,
    };
  }
}

// Export singleton instance
export const printService = new PrintService();

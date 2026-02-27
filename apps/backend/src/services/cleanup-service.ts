import fs from "fs/promises";
import path from "path";
import { db } from "../db";
import { photos, sessions } from "../db/schema";
import { eq, and, lt } from "drizzle-orm";
import { logger } from "@photonic/utils";

/**
 * Cleanup Service
 * Handles automatic cleanup of old photo versions after session completion
 */
export class CleanupService {
  private photosDir: string;
  private processedDir: string;

  constructor() {
    this.photosDir = path.join(process.cwd(), "data", "photos");
    this.processedDir = path.join(process.cwd(), "data", "processed");
  }

  /**
   * Cleanup old photo versions for a session
   * Keeps only the current (highest version) of each photo
   * Deletes v1, v2, etc. when v3 is the current version
   */
  async cleanupSession(sessionId: string): Promise<{
    success: boolean;
    deletedCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let deletedCount = 0;

    try {
      logger.info("Starting cleanup for session", { sessionId });

      // Get all photos for this session
      const sessionPhotos = await db.query.photos.findMany({
        where: eq(photos.sessionId, sessionId),
      });

      // Group photos by their logical "slot" (sequenceNumber)
      // Each slot may have multiple versions (v1, v2, v3...)
      const photosBySlot = new Map<number, typeof sessionPhotos>();

      for (const photo of sessionPhotos) {
        // Skip composites (sequenceNumber 99)
        if (photo.sequenceNumber === 99) continue;

        const slot = photo.sequenceNumber;
        if (!photosBySlot.has(slot)) {
          photosBySlot.set(slot, []);
        }
        photosBySlot.get(slot)!.push(photo);
      }

      // For each slot, keep only the highest version
      for (const [slot, slotPhotos] of photosBySlot) {
        if (slotPhotos.length <= 1) continue; // No old versions to clean

        // Sort by version descending
        slotPhotos.sort((a, b) => (b.version || 1) - (a.version || 1));

        // Keep the first one (highest version), delete the rest
        const currentPhoto = slotPhotos[0];
        const oldVersions = slotPhotos.slice(1);

        logger.info("Found old versions to cleanup", {
          sessionId,
          slot,
          currentVersion: currentPhoto.version || 1,
          oldVersionsCount: oldVersions.length,
        });

        // Delete old version files
        for (const oldPhoto of oldVersions) {
          try {
            // Delete original file
            if (oldPhoto.originalPath) {
              await fs.unlink(oldPhoto.originalPath);
              logger.debug("Deleted old photo version", {
                path: oldPhoto.originalPath,
                version: oldPhoto.version || 1,
              });
            }

            // Delete processed file if exists
            if (oldPhoto.processedPath) {
              await fs.unlink(oldPhoto.processedPath).catch(() => {
                // File may not exist, that's ok
              });
            }

            deletedCount++;
          } catch (error) {
            const errorMsg =
              error instanceof Error ? error.message : String(error);
            errors.push(
              `Failed to delete version ${oldPhoto.version} of photo ${oldPhoto.id}: ${errorMsg}`,
            );
            logger.error("Failed to delete old photo version", {
              photoId: oldPhoto.id,
              path: oldPhoto.originalPath,
              error: errorMsg,
            });
          }
        }
      }

      // Mark session as cleaned up (optional - could add a flag to sessions table)
      logger.info("Session cleanup completed", {
        sessionId,
        deletedCount,
        errors: errors.length,
      });

      return {
        success: errors.length === 0,
        deletedCount,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Session cleanup failed", {
        sessionId,
        error: errorMsg,
      });
      return {
        success: false,
        deletedCount,
        errors: [...errors, errorMsg],
      };
    }
  }

  /**
   * Find and cleanup orphaned files
   * Files that exist on disk but have no corresponding database record
   */
  async cleanupOrphanedFiles(): Promise<{
    success: boolean;
    deletedCount: number;
    errors: string[];
  }> {
    const errors: string[] = [];
    let deletedCount = 0;

    try {
      logger.info("Starting orphaned files cleanup");

      // Get all photo paths from database
      const allPhotos = await db.query.photos.findMany();
      const validPaths = new Set<string>();

      for (const photo of allPhotos) {
        if (photo.originalPath) validPaths.add(photo.originalPath);
        if (photo.processedPath) validPaths.add(photo.processedPath);
      }

      // Check photos directory
      try {
        const photoFiles = await fs.readdir(this.photosDir);
        for (const file of photoFiles) {
          const filePath = path.join(this.photosDir, file);
          if (!validPaths.has(filePath)) {
            try {
              await fs.unlink(filePath);
              deletedCount++;
              logger.debug("Deleted orphaned photo file", { path: filePath });
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              errors.push(`Failed to delete ${filePath}: ${errorMsg}`);
            }
          }
        }
      } catch (error) {
        // Directory may not exist yet
      }

      // Check processed directory
      try {
        const processedFiles = await fs.readdir(this.processedDir);
        for (const file of processedFiles) {
          const filePath = path.join(this.processedDir, file);
          if (!validPaths.has(filePath)) {
            try {
              await fs.unlink(filePath);
              deletedCount++;
              logger.debug("Deleted orphaned processed file", {
                path: filePath,
              });
            } catch (error) {
              const errorMsg =
                error instanceof Error ? error.message : String(error);
              errors.push(`Failed to delete ${filePath}: ${errorMsg}`);
            }
          }
        }
      } catch (error) {
        // Directory may not exist yet
      }

      logger.info("Orphaned files cleanup completed", {
        deletedCount,
        errors: errors.length,
      });

      return {
        success: errors.length === 0,
        deletedCount,
        errors,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error("Orphaned files cleanup failed", { error: errorMsg });
      return {
        success: false,
        deletedCount,
        errors: [...errors, errorMsg],
      };
    }
  }

  /**
   * Schedule periodic cleanup job
   * Should be called on server startup
   */
  startPeriodicCleanup(intervalHours: number = 24): void {
    const intervalMs = intervalHours * 60 * 60 * 1000;

    logger.info("Starting periodic cleanup job", {
      intervalHours,
      intervalMs,
    });

    // Run immediately on startup
    this.cleanupOrphanedFiles().catch((error) => {
      logger.error("Initial orphaned files cleanup failed", { error });
    });

    // Schedule recurring cleanup
    setInterval(() => {
      logger.info("Running scheduled orphaned files cleanup");
      this.cleanupOrphanedFiles().catch((error) => {
        logger.error("Scheduled orphaned files cleanup failed", { error });
      });
    }, intervalMs);
  }
}

// Singleton instance
let cleanupServiceInstance: CleanupService | null = null;

export function getCleanupService(): CleanupService {
  if (!cleanupServiceInstance) {
    cleanupServiceInstance = new CleanupService();
  }
  return cleanupServiceInstance;
}

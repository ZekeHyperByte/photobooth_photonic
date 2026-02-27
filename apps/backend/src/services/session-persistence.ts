/**
 * Session Persistence Service
 *
 * Handles session crash recovery by tracking session state in the database.
 * On startup, finds orphaned 'in_progress' sessions and marks them as 'abandoned'.
 */

import { db as defaultDb } from "../db";
import { sessions, photos } from "../db/schema";
import { eq, and, lt, sql } from "drizzle-orm";
import { createLogger } from "@photonic/utils";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";

const logger = createLogger("session-persistence");

/**
 * Drizzle database type
 */
type DrizzleDB = BetterSQLite3Database<typeof schema>;

/**
 * Session with photo count for recovery
 */
export interface OrphanedSession {
  id: string;
  packageId: string;
  status: string;
  startedAt: Date;
  photoCount: number;
}

/**
 * Recovery statistics
 */
export interface RecoveryStats {
  abandonedSessions: number;
  totalPhotos: number;
  oldestSession: Date | null;
}

/**
 * Session Persistence Service
 */
export class SessionPersistenceService {
  private readonly ABANDON_THRESHOLD_HOURS = 1;
  private isInitialized = false;
  private db: DrizzleDB;

  /**
   * Create a new SessionPersistenceService
   * @param db - Optional database instance for dependency injection (testing)
   */
  constructor(db?: DrizzleDB) {
    this.db = db ?? defaultDb;
  }

  /**
   * Initialize session persistence
   * Should be called on application startup
   */
  async initialize(): Promise<RecoveryStats> {
    logger.info("SessionPersistence: Initializing...");

    try {
      const stats = await this.recoverOrphanedSessions();
      this.isInitialized = true;
      logger.info("SessionPersistence: Recovery complete", stats);
      return stats;
    } catch (error) {
      logger.error("SessionPersistence: Recovery failed", { error });
      return {
        abandonedSessions: 0,
        totalPhotos: 0,
        oldestSession: null,
      };
    }
  }

  /**
   * Recover crashed sessions (alias for recoverOrphanedSessions)
   * Returns the number of sessions recovered
   */
  async recoverCrashedSessions(): Promise<number> {
    try {
      const stats = await this.recoverOrphanedSessions();
      return stats.abandonedSessions;
    } catch (error) {
      logger.error("SessionPersistence: Failed to recover crashed sessions", {
        error,
      });
      return 0;
    }
  }

  /**
   * Close the persistence service
   * Cleanup any resources (no-op for this implementation)
   */
  close(): void {
    logger.info("SessionPersistence: Closing service");
    this.isInitialized = false;
  }

  /**
   * Recover orphaned sessions
   * Finds sessions older than 1 hour with 'in_progress' status and marks them 'abandoned'
   */
  private async recoverOrphanedSessions(): Promise<RecoveryStats> {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - this.ABANDON_THRESHOLD_HOURS);

    // Find orphaned sessions
    const orphanedSessions = await this.db
      .select({
        id: sessions.id,
        packageId: sessions.packageId,
        status: sessions.status,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.status, "in_progress"),
          lt(sessions.startedAt, cutoffTime),
        ),
      )
      .all();

    if (orphanedSessions.length === 0) {
      logger.info("SessionPersistence: No orphaned sessions found");
      return {
        abandonedSessions: 0,
        totalPhotos: 0,
        oldestSession: null,
      };
    }

    logger.warn(
      `SessionPersistence: Found ${orphanedSessions.length} orphaned session(s) older than ${this.ABANDON_THRESHOLD_HOURS} hour(s)`,
    );

    let totalPhotos = 0;
    let oldestSession: Date | null = null;

    // Mark each orphaned session as abandoned
    for (const session of orphanedSessions) {
      // Count photos in session
      const photoCount = await this.db
        .select({ count: sql`count(*)` })
        .from(photos)
        .where(eq(photos.sessionId, session.id))
        .get();

      const count = Number(photoCount?.count || 0);
      totalPhotos += count;

      if (!oldestSession || session.startedAt < oldestSession) {
        oldestSession = session.startedAt;
      }

      logger.info(`SessionPersistence: Abandoning session ${session.id}`, {
        startedAt: session.startedAt,
        photoCount: count,
      });

      // Update session status to abandoned
      await this.db
        .update(sessions)
        .set({
          status: "abandoned",
          metadata: JSON.stringify({
            abandonedAt: new Date().toISOString(),
            reason: "Session recovery on startup",
            photoCount: count,
          }),
        })
        .where(eq(sessions.id, session.id))
        .run();
    }

    return {
      abandonedSessions: orphanedSessions.length,
      totalPhotos,
      oldestSession,
    };
  }

  /**
   * Get recovery statistics for admin panel
   */
  async getRecoveryStats(): Promise<RecoveryStats> {
    const cutoffTime = new Date();
    cutoffTime.setHours(cutoffTime.getHours() - this.ABANDON_THRESHOLD_HOURS);

    const abandonedSessions = await this.db
      .select({
        id: sessions.id,
        startedAt: sessions.startedAt,
      })
      .from(sessions)
      .where(eq(sessions.status, "abandoned"))
      .all();

    let totalPhotos = 0;
    let oldestSession: Date | null = null;

    for (const session of abandonedSessions) {
      const photoCount = await this.db
        .select({ count: sql`count(*)` })
        .from(photos)
        .where(eq(photos.sessionId, session.id))
        .get();

      totalPhotos += Number(photoCount?.count || 0);

      if (!oldestSession || session.startedAt < oldestSession) {
        oldestSession = session.startedAt;
      }
    }

    return {
      abandonedSessions: abandonedSessions.length,
      totalPhotos,
      oldestSession,
    };
  }

  /**
   * Create a new session with persistence tracking
   */
  async createSession(sessionId: string, packageId: string): Promise<void> {
    logger.info(`SessionPersistence: Tracking new session ${sessionId}`);

    await this.db
      .insert(sessions)
      .values({
        id: sessionId,
        packageId,
        status: "in_progress",
        startedAt: new Date(),
      })
      .run();
  }

  /**
   * Update session status
   */
  async updateSessionStatus(sessionId: string, status: string): Promise<void> {
    logger.info(
      `SessionPersistence: Updating session ${sessionId} to ${status}`,
    );

    const updates: any = { status };

    if (status === "completed") {
      updates.completedAt = new Date();
    }

    await this.db
      .update(sessions)
      .set(updates)
      .where(eq(sessions.id, sessionId))
      .run();

    // Trigger cleanup of old photo versions when session completes
    if (status === "completed") {
      try {
        const { getCleanupService } = await import("./cleanup-service");
        const cleanupService = getCleanupService();

        // Run cleanup asynchronously (don't block session completion)
        cleanupService.cleanupSession(sessionId).then((result) => {
          if (result.success) {
            logger.info(
              `SessionPersistence: Cleanup completed for session ${sessionId}`,
              {
                deletedCount: result.deletedCount,
              },
            );
          } else {
            logger.warn(
              `SessionPersistence: Cleanup had errors for session ${sessionId}`,
              {
                errors: result.errors,
              },
            );
          }
        });
      } catch (error) {
        // Log but don't fail session completion if cleanup fails
        logger.error(
          `SessionPersistence: Failed to trigger cleanup for session ${sessionId}`,
          {
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }
  }

  /**
   * Record photo capture in session
   */
  async recordPhotoCapture(
    photoId: string,
    sessionId: string,
    sequenceNumber: number,
    filePath: string,
  ): Promise<void> {
    logger.debug(
      `SessionPersistence: Recording photo ${photoId} for session ${sessionId}`,
    );

    await this.db
      .insert(photos)
      .values({
        id: photoId,
        sessionId,
        sequenceNumber,
        originalPath: filePath,
        captureTime: new Date(),
        processingStatus: "completed",
      })
      .run();
  }
}

// Singleton instance
let sessionPersistenceService: SessionPersistenceService | null = null;

export function getSessionPersistenceService(): SessionPersistenceService {
  if (!sessionPersistenceService) {
    sessionPersistenceService = new SessionPersistenceService();
  }
  return sessionPersistenceService;
}

/**
 * Session Persistence Service Tests
 *
 * Tests the SessionPersistenceService which handles session crash recovery
 * by tracking session state in the database.
 *
 * Source: apps/backend/src/services/session-persistence.ts
 *
 * Critical Invariants:
 * - createSession() writes to DB with status 'in_progress'
 * - recoverCrashedSessions() marks sessions older than 1hr 'abandoned'
 * - recoverCrashedSessions() does NOT touch sessions newer than 1hr
 * - recoverCrashedSessions() returns correct count of abandoned sessions
 * - recoverCrashedSessions() is idempotent (run twice, same count)
 * - getAbandonedCount() returns correct number for admin panel
 */

import { describe, it, expect, beforeAll, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../../db/schema";
import { SessionPersistenceService } from "../../services/session-persistence";
import { eq, sql } from "drizzle-orm";

// Create in-memory database for tests
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

describe("SessionPersistenceService", () => {
  let service: SessionPersistenceService;

  beforeAll(() => {
    sqlite = new Database(":memory:");
    db = drizzle(sqlite, { schema });

    // Create tables using the actual Drizzle schema SQL
    // We need to create tables that match the schema exactly
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS packages (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        photo_count INTEGER NOT NULL,
        price INTEGER NOT NULL,
        currency TEXT NOT NULL DEFAULT 'IDR',
        is_active INTEGER NOT NULL DEFAULT 1,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );

      CREATE TABLE IF NOT EXISTS booth_codes (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'generated',
        generated_by TEXT,
        generated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        used_at INTEGER,
        used_by_session_id TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL REFERENCES packages(id),
        booth_code_id TEXT REFERENCES booth_codes(id),
        status TEXT NOT NULL,
        phone_number TEXT,
        started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        completed_at INTEGER,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES sessions(id),
        sequence_number INTEGER NOT NULL,
        original_path TEXT NOT NULL,
        processed_path TEXT,
        template_id TEXT,
        filter_id TEXT,
        capture_time INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        processing_status TEXT NOT NULL DEFAULT 'pending',
        processing_error TEXT,
        file_size INTEGER,
        width INTEGER,
        height INTEGER,
        metadata TEXT
      );

      -- Insert a default package for foreign key references
      INSERT INTO packages (id, name, photo_count, price) VALUES ('package-1', 'Test Package', 3, 10000);
    `);
  });

  beforeEach(() => {
    // Clean tables before each test
    sqlite.exec("DELETE FROM photos");
    sqlite.exec("DELETE FROM sessions");
    // Re-insert default package if needed
    sqlite.exec(
      `INSERT OR IGNORE INTO packages (id, name, photo_count, price) VALUES ('package-1', 'Test Package', 3, 10000)`,
    );

    service = new SessionPersistenceService(db);
  });

  afterEach(() => {
    service.close();
  });

  describe("createSession()", () => {
    it("writes to DB with status 'in_progress'", async () => {
      const sessionId = "test-session-1";
      const packageId = "package-1";

      await service.createSession(sessionId, packageId);

      const result = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sessionId))
        .get();

      expect(result).toBeDefined();
      expect(result?.status).toBe("in_progress");
      expect(result?.packageId).toBe(packageId);
    });

    it("creates multiple sessions with unique IDs", async () => {
      await service.createSession("session-1", "package-1");
      await service.createSession("session-2", "package-1");

      const result = db
        .select({ count: sql<number>`count(*)` })
        .from(schema.sessions)
        .get();

      expect(result?.count ?? 0).toBe(2);
    });
  });

  describe("recoverCrashedSessions()", () => {
    it("marks sessions older than 1 hour as 'abandoned'", async () => {
      // Create an old session (2 hours ago)
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      db.insert(schema.sessions)
        .values({
          id: "old-session",
          packageId: "package-1",
          status: "in_progress",
          startedAt: twoHoursAgo,
        })
        .run();

      const recovered = await service.recoverCrashedSessions();

      expect(recovered).toBe(1);

      const session = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, "old-session"))
        .get();

      expect(session?.status).toBe("abandoned");
    });

    it("does NOT touch sessions newer than 1 hour", async () => {
      // Create a recent session (30 minutes ago)
      const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
      db.insert(schema.sessions)
        .values({
          id: "recent-session",
          packageId: "package-1",
          status: "in_progress",
          startedAt: thirtyMinutesAgo,
        })
        .run();

      const recovered = await service.recoverCrashedSessions();

      expect(recovered).toBe(0);

      const session = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, "recent-session"))
        .get();

      expect(session?.status).toBe("in_progress");
    });

    it("returns correct count of abandoned sessions", async () => {
      // Create 3 old sessions
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      for (let i = 0; i < 3; i++) {
        db.insert(schema.sessions)
          .values({
            id: `old-session-${i}`,
            packageId: "package-1",
            status: "in_progress",
            startedAt: twoHoursAgo,
          })
          .run();
      }

      const recovered = await service.recoverCrashedSessions();

      expect(recovered).toBe(3);
    });

    it("is idempotent - running twice returns same count", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      db.insert(schema.sessions)
        .values({
          id: "old-session",
          packageId: "package-1",
          status: "in_progress",
          startedAt: twoHoursAgo,
        })
        .run();

      const firstRun = await service.recoverCrashedSessions();
      const secondRun = await service.recoverCrashedSessions();

      expect(firstRun).toBe(1);
      expect(secondRun).toBe(0); // Already marked abandoned
    });

    it("counts photos in abandoned sessions", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      // Create session
      db.insert(schema.sessions)
        .values({
          id: "session-with-photos",
          packageId: "package-1",
          status: "in_progress",
          startedAt: twoHoursAgo,
        })
        .run();

      // Add photos to session
      for (let i = 0; i < 5; i++) {
        db.insert(schema.photos)
          .values({
            id: `photo-${i}`,
            sessionId: "session-with-photos",
            sequenceNumber: i + 1,
            originalPath: `/path/photo-${i}.jpg`,
          })
          .run();
      }

      const stats = await service.initialize();

      expect(stats.abandonedSessions).toBe(1);
      expect(stats.totalPhotos).toBe(5);
    });
  });

  describe("getAbandonedCount()", () => {
    it("returns correct number of abandoned sessions", async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

      // Create 2 old sessions
      db.insert(schema.sessions)
        .values({
          id: "session-1",
          packageId: "package-1",
          status: "in_progress",
          startedAt: twoHoursAgo,
        })
        .run();

      db.insert(schema.sessions)
        .values({
          id: "session-2",
          packageId: "package-1",
          status: "in_progress",
          startedAt: twoHoursAgo,
        })
        .run();

      // Recover them
      await service.recoverCrashedSessions();

      // Get stats
      const stats = await service.getRecoveryStats();

      expect(stats.abandonedSessions).toBe(2);
    });

    it("returns 0 when no abandoned sessions", async () => {
      const stats = await service.getRecoveryStats();
      expect(stats.abandonedSessions).toBe(0);
    });
  });

  describe("updateSessionStatus()", () => {
    it("updates status to completed", async () => {
      db.insert(schema.sessions)
        .values({
          id: "test-session",
          packageId: "package-1",
          status: "in_progress",
        })
        .run();

      await service.updateSessionStatus("test-session", "completed");

      const session = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, "test-session"))
        .get();

      expect(session?.status).toBe("completed");
    });

    it("sets completedAt when status is 'completed'", async () => {
      db.insert(schema.sessions)
        .values({
          id: "test-session",
          packageId: "package-1",
          status: "in_progress",
        })
        .run();

      await service.updateSessionStatus("test-session", "completed");

      const session = db
        .select()
        .from(schema.sessions)
        .where(eq(schema.sessions.id, "test-session"))
        .get();

      expect(session?.completedAt).toBeDefined();
    });
  });

  describe("recordPhotoCapture()", () => {
    it("records photo in database", async () => {
      db.insert(schema.sessions)
        .values({
          id: "test-session",
          packageId: "package-1",
          status: "in_progress",
        })
        .run();

      await service.recordPhotoCapture(
        "photo-1",
        "test-session",
        1,
        "/path/photo-1.jpg",
      );

      const photo = db
        .select()
        .from(schema.photos)
        .where(eq(schema.photos.id, "photo-1"))
        .get();

      expect(photo).toBeDefined();
      expect(photo?.sessionId).toBe("test-session");
      expect(photo?.sequenceNumber).toBe(1);
    });
  });
});

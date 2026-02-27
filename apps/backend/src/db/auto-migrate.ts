import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { createLogger } from "@photonic/utils";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const logger = createLogger("auto-migrate");

/**
 * Automatically run database migrations on startup
 * This ensures database schema is always up-to-date
 */
export async function autoMigrate(dbPath: string): Promise<boolean> {
  try {
    // Ensure directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      logger.info(`Created database directory: ${dbDir}`);
    }

    const dbExists = fs.existsSync(dbPath);

    if (dbExists) {
      logger.info(`Database exists at: ${dbPath}`);
      logger.info("Checking for pending migrations...");
    } else {
      logger.info(`Creating new database at: ${dbPath}`);
    }

    const sqlite = new Database(dbPath);
    sqlite.pragma("foreign_keys = ON");
    const db = drizzle(sqlite, { schema });

    // Run migrations
    migrate(db, {
      migrationsFolder: path.join(__dirname, "migrations"),
    });

    sqlite.close();

    if (dbExists) {
      logger.info("Database migrations completed successfully");
    } else {
      logger.info("New database created and migrations applied");
    }

    return true;
  } catch (error) {
    logger.error("Auto-migration failed:", error);
    return false;
  }
}

/**
 * Check if database needs migration
 * Useful for showing warnings before starting server
 */
export async function checkMigrationStatus(dbPath: string): Promise<{
  needsMigration: boolean;
  currentVersion: number;
  error?: string;
}> {
  try {
    if (!fs.existsSync(dbPath)) {
      return { needsMigration: true, currentVersion: 0 };
    }

    const sqlite = new Database(dbPath);

    // Check if migrations table exists
    const tableExists = sqlite
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='__drizzle_migrations'",
      )
      .get();

    if (!tableExists) {
      sqlite.close();
      return { needsMigration: true, currentVersion: 0 };
    }

    // Get current migration count
    const result = sqlite
      .prepare("SELECT COUNT(*) as count FROM __drizzle_migrations")
      .get() as { count: number };
    sqlite.close();

    return {
      needsMigration: false, // Assume up-to-date, actual check happens in autoMigrate
      currentVersion: result.count,
    };
  } catch (error) {
    return {
      needsMigration: true,
      currentVersion: 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

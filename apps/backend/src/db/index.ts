import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import { createLogger } from '@photonic/utils';
import fs from 'fs';
import path from 'path';

const logger = createLogger('database');

let db: ReturnType<typeof drizzle>;
let sqlite: Database.Database;

/**
 * Initialize database connection
 */
export function initDatabase(dbPath: string = './data/photobooth.db') {
  try {
    // Ensure data directory exists
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      logger.info(`Created database directory: ${dbDir}`);
    }

    // Create SQLite connection
    sqlite = new Database(dbPath);

    // Enable foreign keys
    sqlite.pragma('foreign_keys = ON');

    // Enable WAL mode for better concurrency
    sqlite.pragma('journal_mode = WAL');

    // Create Drizzle instance
    db = drizzle(sqlite, { schema });

    logger.info(`Database initialized at: ${dbPath}`);

    return db;
  } catch (error) {
    logger.error('Failed to initialize database:', error);
    throw error;
  }
}

// Export db instance for use in routes
export { db };

/**
 * Close database connection
 */
export function closeDatabase() {
  if (sqlite) {
    sqlite.close();
    logger.info('Database connection closed');
  }
}

/**
 * Get database instance
 */
export function getDatabase() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Get raw SQLite instance
 */
export function getSQLite() {
  if (!sqlite) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return sqlite;
}

// Export schema for use in other modules
export * from './schema';

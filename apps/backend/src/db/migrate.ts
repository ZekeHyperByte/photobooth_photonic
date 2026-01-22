import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import { createLogger } from '@photonic/utils';
import path from 'path';
import fs from 'fs';
import * as schema from './schema';

const logger = createLogger('migrations');

async function runMigrations() {
  try {
    const dbPath = process.env.DATABASE_PATH || './data/photobooth.db';
    const dbDir = path.dirname(dbPath);

    // Ensure data directory exists
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
      logger.info(`Created database directory: ${dbDir}`);
    }

    logger.info(`Running migrations on database: ${dbPath}`);

    const sqlite = new Database(dbPath);
    sqlite.pragma('foreign_keys = ON');
    const db = drizzle(sqlite, { schema });

    // Run migrations
    migrate(db, {
      migrationsFolder: path.join(__dirname, 'migrations'),
    });

    sqlite.close();

    logger.info('Migrations completed successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigrations();

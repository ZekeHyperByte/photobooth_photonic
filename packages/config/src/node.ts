/**
 * Node.js-specific configuration constants
 * These require Node.js environment (process.env access)
 * Do NOT import this in browser/frontend code!
 */

// ============================================================================
// Paths Configuration (Node.js only - uses process.env)
// ============================================================================

export const PATHS = {
  /** Temporary photos during capture */
  TEMP_PHOTOS: process.env.TEMP_PHOTO_PATH ?? "./data/photos",
  /** Processed photos with templates/filters applied */
  PROCESSED: process.env.PROCESSED_PATH ?? "./data/processed",
  /** Template files */
  TEMPLATES: process.env.TEMPLATES_PATH ?? "./data/templates",
  /** Thumbnail images */
  THUMBNAILS: process.env.THUMBNAILS_PATH ?? "./data/thumbnails",
  /** Database file */
  DATABASE: process.env.DATABASE_PATH ?? "./data/photobooth.db",
  /** Log files */
  LOGS: "./logs",
  /** Data directory root */
  DATA: "./data",
} as const;

// ============================================================================
// Environment Detection
// ============================================================================

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

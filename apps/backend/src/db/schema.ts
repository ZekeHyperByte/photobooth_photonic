import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';

// ============================================================================
// Settings Table
// ============================================================================

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// Packages Table
// ============================================================================

export const packages = sqliteTable('packages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  photoCount: integer('photo_count').notNull(),
  price: integer('price').notNull(),
  currency: text('currency').notNull().default('IDR'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// Templates Table
// ============================================================================

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  filePath: text('file_path').notNull(),
  thumbnailPath: text('thumbnail_path'),
  previewPath: text('preview_path'), // Preview image with sample photo applied
  templateType: text('template_type').notNull(), // 'overlay' | 'frame' | 'background'
  positionData: text('position_data', { mode: 'json' }), // JSON string
  photoCount: integer('photo_count').notNull().default(3), // Number of photo zones
  canvasWidth: integer('canvas_width').notNull().default(3508), // A3 @ 300 DPI
  canvasHeight: integer('canvas_height').notNull().default(4960), // A3 @ 300 DPI
  paperSize: text('paper_size').notNull().default('A3'), // 'A3' | 'A4' | 'CUSTOM'
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// Filters Table
// ============================================================================

export const filters = sqliteTable('filters', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  filterConfig: text('filter_config', { mode: 'json' }).notNull(), // JSON string
  thumbnailPath: text('thumbnail_path'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  displayOrder: integer('display_order').notNull().default(0),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// Booth Codes Table
// ============================================================================

export const boothCodes = sqliteTable('booth_codes', {
  id: text('id').primaryKey(),
  code: text('code').notNull().unique(), // 4-digit code
  status: text('status').notNull().default('generated'), // 'generated' | 'used' | 'expired'
  generatedBy: text('generated_by'),
  generatedAt: integer('generated_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  usedAt: integer('used_at', { mode: 'timestamp' }),
  usedBySessionId: text('used_by_session_id'),
  metadata: text('metadata', { mode: 'json' }),
});

// ============================================================================
// Sessions Table
// ============================================================================

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  packageId: text('package_id')
    .notNull()
    .references(() => packages.id),
  boothCodeId: text('booth_code_id').references(() => boothCodes.id),
  status: text('status').notNull(), // SessionStatus
  phoneNumber: text('phone_number'),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  completedAt: integer('completed_at', { mode: 'timestamp' }),
  metadata: text('metadata', { mode: 'json' }),
});

// ============================================================================
// Transactions Table
// ============================================================================

export const transactions = sqliteTable('transactions', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  orderId: text('order_id').notNull().unique(),
  grossAmount: integer('gross_amount').notNull(),
  paymentType: text('payment_type').notNull().default('qris'),
  transactionStatus: text('transaction_status').notNull(), // TransactionStatus
  provider: text('provider').notNull().default('mock'), // 'mock' | 'midtrans' | 'xendit' | etc
  qrCodeUrl: text('qr_code_url'),
  qrString: text('qr_string'),
  transactionTime: integer('transaction_time', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  paymentTime: integer('payment_time', { mode: 'timestamp' }),
  expiryTime: integer('expiry_time', { mode: 'timestamp' }),
  // Renamed from midtransResponse for generic provider support
  providerResponse: text('provider_response', { mode: 'json' }),
});

// ============================================================================
// Photos Table
// ============================================================================

export const photos = sqliteTable('photos', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  sequenceNumber: integer('sequence_number').notNull(),
  originalPath: text('original_path').notNull(),
  processedPath: text('processed_path'),
  templateId: text('template_id').references(() => templates.id),
  filterId: text('filter_id').references(() => filters.id),
  captureTime: integer('capture_time', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  processingStatus: text('processing_status').notNull().default('pending'), // ProcessingStatus
  processingError: text('processing_error'),
  fileSize: integer('file_size'),
  width: integer('width'),
  height: integer('height'),
  metadata: text('metadata', { mode: 'json' }),
});

// ============================================================================
// Print Queue Table
// ============================================================================

export const printQueue = sqliteTable('print_queue', {
  id: text('id').primaryKey(),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  photoPath: text('photo_path').notNull().default(''), // Path to photo file
  status: text('status').notNull().default('pending'), // PrintStatus
  copies: integer('copies').notNull().default(1),
  paperSize: text('paper_size').notNull().default('A3'), // 'A3' | 'A4' | 'CUSTOM'
  queuedAt: integer('queued_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  printedAt: integer('printed_at', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
});

// ============================================================================
// WhatsApp Deliveries Table
// ============================================================================

export const whatsappDeliveries = sqliteTable('whatsapp_deliveries', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  photoId: text('photo_id')
    .notNull()
    .references(() => photos.id),
  phoneNumber: text('phone_number').notNull(),
  status: text('status').notNull().default('pending'), // DeliveryStatus
  sentAt: integer('sent_at', { mode: 'timestamp' }),
  errorMessage: text('error_message'),
  retryCount: integer('retry_count').notNull().default(0),
  externalId: text('external_id'),
});

// ============================================================================
// Audit Logs Table
// ============================================================================

export const auditLogs = sqliteTable('audit_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventType: text('event_type').notNull(),
  entityType: text('entity_type'),
  entityId: text('entity_id'),
  description: text('description'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

// ============================================================================
// Type exports for use in application
// ============================================================================

export type Setting = typeof settings.$inferSelect;
export type NewSetting = typeof settings.$inferInsert;

export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

export type Filter = typeof filters.$inferSelect;
export type NewFilter = typeof filters.$inferInsert;

export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;

export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;

export type PrintQueueItem = typeof printQueue.$inferSelect;
export type NewPrintQueueItem = typeof printQueue.$inferInsert;

export type WhatsAppDelivery = typeof whatsappDeliveries.$inferSelect;
export type NewWhatsAppDelivery = typeof whatsappDeliveries.$inferInsert;

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;

export type BoothCode = typeof boothCodes.$inferSelect;
export type NewBoothCode = typeof boothCodes.$inferInsert;

// ============================================================================
// Relations
// ============================================================================

export const photosRelations = relations(photos, ({ one }) => ({
  template: one(templates, {
    fields: [photos.templateId],
    references: [templates.id],
  }),
  filter: one(filters, {
    fields: [photos.filterId],
    references: [filters.id],
  }),
  session: one(sessions, {
    fields: [photos.sessionId],
    references: [sessions.id],
  }),
}));

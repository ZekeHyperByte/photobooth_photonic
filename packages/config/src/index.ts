/**
 * Shared configuration constants for Photonic photo booth system
 */

// ============================================================================
// Service Ports
// ============================================================================

export const PORTS = {
  BACKEND: 4000,
  BRIDGE: 5000,
} as const;

// ============================================================================
// API Endpoints
// ============================================================================

export const API_ENDPOINTS = {
  // Backend API base
  BACKEND_BASE: `http://localhost:${PORTS.BACKEND}`,
  BRIDGE_BASE: `http://localhost:${PORTS.BRIDGE}`,

  // Public endpoints
  PACKAGES: "/api/packages",
  SESSIONS: "/api/sessions",
  PAYMENT_CREATE: "/api/payment/create",
  PAYMENT_VERIFY: "/api/payment/verify",
  PAYMENT_STATUS: "/api/payment/status",
  PHOTOS: "/api/photos",
  TEMPLATES: "/api/templates",
  FILTERS: "/api/filters",
  DELIVERY_WHATSAPP: "/api/delivery/whatsapp",
  DELIVERY_PRINT: "/api/delivery/print",

  // Admin endpoints
  ADMIN_LOGIN: "/api/admin/login",
  ADMIN_PACKAGES: "/api/admin/packages",
  ADMIN_TEMPLATES: "/api/admin/templates",
  ADMIN_FILTERS: "/api/admin/filters",
  ADMIN_ANALYTICS: "/api/admin/analytics",
  ADMIN_TRANSACTIONS: "/api/admin/transactions",
  ADMIN_SETTINGS: "/api/admin/settings",
  ADMIN_BACKUP: "/api/admin/backup",

  // SSE endpoints
  EVENTS_PAYMENT: "/events/payment",
  EVENTS_CAMERA: "/events/camera",

  // Bridge endpoints
  CAMERA_CAPTURE: "/camera/capture",
  CAMERA_STATUS: "/camera/status",
  CAMERA_PREVIEW: "/camera/preview",
  CAMERA_CONFIGURE: "/camera/configure",
  CAMERA_DETECT: "/camera/detect",
  CAMERA_HEALTH: "/health",
} as const;

// ============================================================================
// Application Constants
// ============================================================================

export const APP_CONFIG = {
  // Application name
  APP_NAME: "Photonic V0.1",
  APP_VERSION: "0.1.0",

  // Timeouts
  PAYMENT_TIMEOUT_MINUTES: 5,
  CAMERA_TIMEOUT_SECONDS: 30,
  CAPTURE_COUNTDOWN_SECONDS: 3,
  API_TIMEOUT_MS: 30000,

  // Session timer
  SESSION_TIME_LIMIT_SECONDS: 300,
  SESSION_TIMER_WARNING_THRESHOLD: 60,
  SESSION_TIMER_ENABLED: true,

  // Pagination
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100,

  // File sizes
  MAX_TEMPLATE_SIZE_MB: 10,
  MAX_PHOTO_SIZE_MB: 50,

  // Image dimensions
  DEFAULT_PHOTO_WIDTH: 1920,
  DEFAULT_PHOTO_HEIGHT: 1080,
  THUMBNAIL_WIDTH: 300,
  THUMBNAIL_HEIGHT: 200,

  // Retry settings
  MAX_RETRY_ATTEMPTS: 3,
  RETRY_DELAY_MS: 2000,

  // Cleanup settings
  AUTO_CLEANUP_DAYS: 30,
  BACKUP_RETENTION_DAYS: 90,

  // Currency
  DEFAULT_CURRENCY: "IDR",

  // Admin
  DEFAULT_ADMIN_PASSWORD: "changeme123",
  JWT_EXPIRY_HOURS: 24,
} as const;

// ============================================================================
// File Paths
// ============================================================================

export const FILE_PATHS = {
  // Database
  DATABASE: "./data/photobooth.db",

  // Storage directories
  DATA_DIR: "./data",
  PHOTOS_DIR: "./data/photos",
  TEMPLATES_DIR: "./data/templates",
  PROCESSED_DIR: "./data/processed",
  BACKUPS_DIR: "./data/backups",
  TEMP_DIR: "./temp",

  // Log files
  LOGS_DIR: "./logs",
  ERROR_LOG: "./logs/error.log",
  COMBINED_LOG: "./logs/combined.log",
} as const;

// ============================================================================
// Environment Variable Keys
// ============================================================================

export const ENV_KEYS = {
  // Node environment
  NODE_ENV: "NODE_ENV",

  // Backend
  BACKEND_PORT: "PORT",
  DATABASE_PATH: "DATABASE_PATH",
  BRIDGE_SERVICE_URL: "BRIDGE_SERVICE_URL",

  // Bridge
  BRIDGE_PORT: "PORT",
  TEMP_PHOTO_PATH: "TEMP_PHOTO_PATH",
  CAMERA_TIMEOUT: "CAMERA_TIMEOUT",
  MOCK_CAMERA: "MOCK_CAMERA",
  USE_WEBCAM: "USE_WEBCAM",

  // Frontend
  VITE_API_URL: "VITE_API_URL",
  VITE_BRIDGE_URL: "VITE_BRIDGE_URL",

  // Payment Provider
  PAYMENT_PROVIDER: "PAYMENT_PROVIDER",

  // Midtrans
  MIDTRANS_SERVER_KEY: "MIDTRANS_SERVER_KEY",
  MIDTRANS_CLIENT_KEY: "MIDTRANS_CLIENT_KEY",
  MIDTRANS_ENVIRONMENT: "MIDTRANS_ENVIRONMENT",

  // WhatsApp
  WHATSAPP_PROVIDER: "WHATSAPP_PROVIDER",
  WHATSAPP_API_KEY: "WHATSAPP_API_KEY",

  // Development
  DEV_MODE: "DEV_MODE",
} as const;

// ============================================================================
// HTTP Status Codes
// ============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
} as const;

// ============================================================================
// Error Messages
// ============================================================================

export const ERROR_MESSAGES = {
  // Generic
  INTERNAL_ERROR: "An internal error occurred",
  NOT_FOUND: "Resource not found",
  VALIDATION_ERROR: "Validation failed",
  UNAUTHORIZED: "Unauthorized access",

  // Session
  SESSION_NOT_FOUND: "Session not found",
  SESSION_EXPIRED: "Session has expired",
  SESSION_ALREADY_PAID: "Session has already been paid",
  INVALID_SESSION_STATUS: "Invalid session status",

  // Payment
  PAYMENT_NOT_FOUND: "Payment not found",
  PAYMENT_EXPIRED: "Payment has expired",
  PAYMENT_FAILED: "Payment failed",
  PAYMENT_TIMEOUT: "Payment timeout",

  // Camera
  CAMERA_NOT_CONNECTED: "Camera not connected",
  CAMERA_ERROR: "Camera error occurred",
  CAPTURE_FAILED: "Photo capture failed",

  // Photo
  PHOTO_NOT_FOUND: "Photo not found",
  PROCESSING_FAILED: "Photo processing failed",

  // Template
  TEMPLATE_NOT_FOUND: "Template not found",
  INVALID_TEMPLATE_FILE: "Invalid template file",

  // Admin
  INVALID_PASSWORD: "Invalid password",
  INVALID_TOKEN: "Invalid or expired token",

  // WhatsApp
  WHATSAPP_DELIVERY_FAILED: "WhatsApp delivery failed",
  INVALID_PHONE_NUMBER: "Invalid phone number",

  // Printer
  PRINTER_ERROR: "Printer error occurred",
  PRINT_QUEUE_FULL: "Print queue is full",
} as const;

// ============================================================================
// Success Messages
// ============================================================================

export const SUCCESS_MESSAGES = {
  SESSION_CREATED: "Session created successfully",
  PAYMENT_CREATED: "Payment created successfully",
  PAYMENT_VERIFIED: "Payment verified successfully",
  PHOTO_CAPTURED: "Photo captured successfully",
  PHOTO_PROCESSED: "Photo processed successfully",
  WHATSAPP_SENT: "Photo sent via WhatsApp",
  PRINT_QUEUED: "Photo queued for printing",
  ADMIN_LOGIN_SUCCESS: "Login successful",
  PACKAGE_CREATED: "Package created successfully",
  PACKAGE_UPDATED: "Package updated successfully",
  PACKAGE_DELETED: "Package deleted successfully",
  TEMPLATE_UPLOADED: "Template uploaded successfully",
  TEMPLATE_UPDATED: "Template updated successfully",
  TEMPLATE_DELETED: "Template deleted successfully",
  SETTINGS_UPDATED: "Settings updated successfully",
  BACKUP_CREATED: "Backup created successfully",
} as const;

// ============================================================================
// Camera Settings Presets
// ============================================================================

export const CAMERA_PRESETS = {
  PORTRAIT: {
    iso: "200",
    aperture: "f/2.8",
    shutterSpeed: "1/125",
    whiteBalance: "auto",
  },
  INDOOR: {
    iso: "800",
    aperture: "f/4",
    shutterSpeed: "1/60",
    whiteBalance: "tungsten",
  },
  OUTDOOR: {
    iso: "100",
    aperture: "f/8",
    shutterSpeed: "1/250",
    whiteBalance: "daylight",
  },
} as const;

// ============================================================================
// Filter Presets
// ============================================================================

export const FILTER_PRESETS = {
  NONE: {
    name: "None",
    config: {},
  },
  BW: {
    name: "Black & White",
    config: { grayscale: true },
  },
  SEPIA: {
    name: "Sepia",
    config: { sepia: true },
  },
  VINTAGE: {
    name: "Vintage",
    config: {
      sepia: true,
      contrast: 1.2,
      brightness: 0.9,
    },
  },
  VIVID: {
    name: "Vivid",
    config: {
      saturation: 1.3,
      contrast: 1.1,
    },
  },
  SOFT: {
    name: "Soft",
    config: {
      blur: 0.5,
      brightness: 1.1,
    },
  },
} as const;

// ============================================================================
// Validation Rules
// ============================================================================

export const VALIDATION = {
  // Phone number (Indonesian format)
  PHONE_REGEX: /^(\+?62|0)[0-9]{9,13}$/,

  // Password
  MIN_PASSWORD_LENGTH: 8,

  // Package
  MIN_PHOTO_COUNT: 1,
  MAX_PHOTO_COUNT: 10,
  MIN_PRICE: 0,

  // Template name
  MAX_TEMPLATE_NAME_LENGTH: 100,

  // File uploads
  ALLOWED_IMAGE_TYPES: ["image/jpeg", "image/jpg", "image/png"],
  ALLOWED_TEMPLATE_TYPES: ["image/png"],
} as const;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get full API URL for backend endpoint
 */
export function getBackendUrl(endpoint: string): string {
  return `${API_ENDPOINTS.BACKEND_BASE}${endpoint}`;
}

/**
 * Get full API URL for bridge endpoint
 */
export function getBridgeUrl(endpoint: string): string {
  return `${API_ENDPOINTS.BRIDGE_BASE}${endpoint}`;
}

/**
 * Check if environment is production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Check if environment is development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

// ============================================================================
// Aliases for convenience
// ============================================================================

/**
 * Alias for API_ENDPOINTS for backward compatibility
 */
export const ENDPOINTS = API_ENDPOINTS;

/**
 * Combined messages object for convenience
 */
export const MESSAGES = {
  SUCCESS: SUCCESS_MESSAGES,
  ERROR: ERROR_MESSAGES,
} as const;

// ============================================================================
// Paper Size Configuration
// ============================================================================

export {
  PAPER_SIZE_CONFIGS,
  DEFAULT_TOLERANCE,
  detectPaperSize,
  validatePaperSizeMatch,
  getPaperSizeLabel,
  getPaperSizeConfig,
  getPrinterMediaOption,
  isLandscape,
  getOrientation,
} from "./paper-sizes.js";
export type { PaperSize, PaperSizeConfig } from "./paper-sizes.js";

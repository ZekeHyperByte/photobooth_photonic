// ============================================================================
// Core Entity Types
// ============================================================================

/**
 * Paper size types for printing
 * - A3: 297mm × 420mm (3508px × 4960px @ 300 DPI)
 * - A4: 210mm × 297mm (2480px × 3508px @ 300 DPI)
 * - CUSTOM: Non-standard dimensions
 */
export type PaperSize = 'A3' | 'A4' | 'CUSTOM';

export interface Package {
  id: string;
  name: string;
  description: string | null;
  photoCount: number;
  price: number;
  currency: string;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Template {
  id: string;
  name: string;
  description: string | null;
  filePath: string;
  thumbnailPath: string | null;
  previewPath: string | null;
  templateType: 'overlay' | 'frame' | 'background';
  positionData: TemplatePosition | MultiZonePosition | null;
  photoCount: number;
  canvasWidth: number;
  canvasHeight: number;
  paperSize: PaperSize;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface TemplatePosition {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
}

export interface PhotoZone {
  id: string;
  x: number;      // Pixels from left
  y: number;      // Pixels from top
  width: number;
  height: number;
  rotation?: number;
  zIndex?: number;
}

export interface FramePositionData {
  photoZones: PhotoZone[];
  canvasWidth: number;
  canvasHeight: number;
}

export interface MultiZonePosition {
  photoZones: TemplatePosition[];
}

export interface Filter {
  id: string;
  name: string;
  description: string | null;
  filterConfig: FilterConfig;
  thumbnailPath: string | null;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
}

export interface FilterConfig {
  brightness?: number;
  contrast?: number;
  saturation?: number;
  grayscale?: boolean;
  sepia?: boolean;
  blur?: number;
  sharpen?: number;
  // Sharp-specific filters
  [key: string]: any;
}

export interface Session {
  id: string;
  packageId: string;
  status: SessionStatus;
  phoneNumber: string | null;
  startedAt: Date;
  completedAt: Date | null;
  metadata: Record<string, any> | null;
}

export type SessionStatus =
  | 'created'
  | 'awaiting_payment'
  | 'paid'
  | 'capturing'
  | 'processing'
  | 'completed'
  | 'failed';

export interface Transaction {
  id: string;
  sessionId: string;
  orderId: string;
  grossAmount: number;
  paymentType: string;
  transactionStatus: TransactionStatus;
  qrCodeUrl: string | null;
  qrString: string | null;
  transactionTime: Date;
  paymentTime: Date | null;
  expiryTime: Date | null;
  midtransResponse: Record<string, any> | null;
}

export type TransactionStatus =
  | 'pending'
  | 'success'
  | 'failed'
  | 'expired';

export interface Photo {
  id: string;
  sessionId: string;
  sequenceNumber: number;
  originalPath: string;
  processedPath: string | null;
  templateId: string | null;
  filterId: string | null;
  captureTime: Date;
  processingStatus: ProcessingStatus;
  processingError: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  metadata: Record<string, any> | null;
}

export type ProcessingStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed';

export interface PrintQueue {
  id: string;
  photoId: string;
  sessionId: string;
  photoPath: string;
  status: PrintStatus;
  copies: number;
  paperSize: PaperSize;
  queuedAt: Date;
  printedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

export type PrintStatus =
  | 'pending'
  | 'printing'
  | 'completed'
  | 'failed';

export interface WhatsAppDelivery {
  id: string;
  sessionId: string;
  photoId: string;
  phoneNumber: string;
  status: DeliveryStatus;
  sentAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  externalId: string | null;
}

export type DeliveryStatus =
  | 'pending'
  | 'sent'
  | 'failed';

export interface Setting {
  id: number;
  key: string;
  value: string;
  description: string | null;
  updatedAt: Date;
}

export interface AuditLog {
  id: number;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  description: string | null;
  metadata: Record<string, any> | null;
  createdAt: Date;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

// Session API
export interface CreateSessionRequest {
  packageId: string;
}

export interface CreateSessionResponse {
  session: Session;
}

export interface GetSessionResponse {
  session: Session;
  transaction?: Transaction;
  photos?: Photo[];
}

// Payment API
export interface CreatePaymentRequest {
  sessionId: string;
  phoneNumber?: string;
}

export interface CreatePaymentResponse {
  transaction: Transaction;
  qrCodeUrl: string;
  qrString: string;
}

export interface VerifyPaymentRequest {
  orderId: string;
}

export interface VerifyPaymentResponse {
  status: TransactionStatus;
  paid: boolean;
}

export interface PaymentStatusResponse {
  status: TransactionStatus;
  paid: boolean;
}

// Photo API
export interface CapturePhotoRequest {
  sessionId: string;
  templateId?: string;
  filterId?: string;
}

export interface CapturePhotoResponse {
  photo: Photo;
  captureUrl: string;
}

export interface ProcessPhotoRequest {
  templateId?: string;
  filterId?: string;
}

export interface ProcessPhotoResponse {
  photo: Photo;
  processedUrl: string;
}

export interface SendWhatsAppRequest {
  phoneNumber: string;
}

export interface SendWhatsAppResponse {
  delivery: WhatsAppDelivery;
}

export interface QueuePrintRequest {
  copies?: number;
  paperSize?: 'A3' | 'A4'; // Override paper size for testing (no CUSTOM for actual printing)
}

export interface QueuePrintResponse {
  printJob: PrintQueue;
}

// Admin API
export interface AdminLoginRequest {
  password: string;
}

export interface AdminLoginResponse {
  token: string;
  expiresAt: string;
}

export interface CreatePackageRequest {
  name: string;
  description?: string;
  photoCount: number;
  price: number;
}

export interface UpdatePackageRequest {
  name?: string;
  description?: string;
  photoCount?: number;
  price?: number;
  isActive?: boolean;
  displayOrder?: number;
}

export interface CreateTemplateRequest {
  name: string;
  description?: string;
  templateType: 'overlay' | 'frame' | 'background';
  positionData?: TemplatePosition | MultiZonePosition;
  paperSize?: PaperSize; // Optional - will auto-detect if not provided
}

export interface UpdateTemplateRequest {
  name?: string;
  description?: string;
  positionData?: TemplatePosition | MultiZonePosition;
  paperSize?: PaperSize;
  isActive?: boolean;
  displayOrder?: number;
}

export interface CreateFilterRequest {
  name: string;
  description?: string;
  filterConfig: FilterConfig;
}

export interface AnalyticsQuery {
  startDate?: string;
  endDate?: string;
  groupBy?: 'day' | 'week' | 'month';
}

export interface AnalyticsResponse {
  totalRevenue: number;
  totalSessions: number;
  successRate: number;
  photosCaptured: number;
  revenueByPackage: Array<{
    packageId: string;
    packageName: string;
    revenue: number;
    count: number;
  }>;
  sessionsByDay: Array<{
    date: string;
    sessions: number;
    revenue: number;
  }>;
}

export interface TransactionListQuery {
  page?: number;
  limit?: number;
  status?: TransactionStatus;
  startDate?: string;
  endDate?: string;
}

export interface TransactionListResponse {
  transactions: Transaction[];
  pagination: {
    total: number;
    page: number;
    pages: number;
  };
}

export interface UpdateSettingsRequest {
  [key: string]: string;
}

export interface BackupResponse {
  backupPath: string;
  timestamp: string;
}

export interface BackupFile {
  filename: string;
  size: number;
  timestamp: Date;
}

// ============================================================================
// Camera/Bridge API Types
// ============================================================================

export interface CameraCaptureRequest {
  sessionId: string;
  sequenceNumber: number;
}

export interface CameraCaptureResponse {
  success: boolean;
  imagePath: string;
  metadata: CameraMetadata;
}

export interface CameraStatusResponse {
  connected: boolean;
  model: string;
  battery: number;
  storageAvailable: boolean;
  settings: CameraSettings;
}

export interface CameraSettings {
  iso?: string;
  shutterSpeed?: string;
  aperture?: string;
  whiteBalance?: string;
  imageFormat?: string;
}

export interface CameraMetadata {
  model: string;
  iso: string;
  shutterSpeed: string;
  aperture: string;
  focalLength: string;
  timestamp: string;
  [key: string]: any;
}

export interface ConfigureCameraRequest {
  iso?: string;
  shutterSpeed?: string;
  aperture?: string;
  whiteBalance?: string;
}

export interface ConfigureCameraResponse {
  success: boolean;
  settings: CameraSettings;
}

export interface CameraInfo {
  model: string;
  port: string;
  abilities: string[];
}

export interface DetectCamerasResponse {
  cameras: CameraInfo[];
}

export interface HealthCheckResponse {
  status: 'ok' | 'error';
  uptime: number;
  cameraConnected: boolean;
}

// ============================================================================
// Server-Sent Events (SSE) Types
// ============================================================================

export interface PaymentUpdateEvent {
  event: 'payment_update';
  data: {
    status: TransactionStatus;
    paid: boolean;
  };
}

export type CameraEventType =
  | 'countdown'
  | 'capturing'
  | 'captured'
  | 'processing'
  | 'error';

export interface CameraEvent {
  event: CameraEventType;
  data: {
    message: string;
    progress?: number;
    photoId?: string;
  };
}

// ============================================================================
// Utility Types
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  details?: any;
}

export interface ApiSuccess<T = any> {
  success: boolean;
  data: T;
}

// ============================================================================
// Electron IPC Types
// ============================================================================

export interface PrintCommand {
  imagePath: string;
  copies: number;
  paperSize: 'A3' | 'A4'; // Paper size for printing (CUSTOM not supported, defaults to A3)
}

export interface PrintResult {
  success: boolean;
  error?: string;
}

export interface SaveFileCommand {
  imagePath: string;
  defaultPath: string;
}

export interface SaveFileResult {
  success: boolean;
  savedPath?: string;
  error?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  backend: {
    port: number;
    databasePath: string;
    dataDir: string;
  };
  bridge: {
    port: number;
    tempPhotoPath: string;
    cameraTimeout: number;
  };
  frontend: {
    apiUrl: string;
    bridgeUrl: string;
  };
  midtrans: {
    serverKey: string;
    clientKey: string;
    environment: 'sandbox' | 'production';
  };
  whatsapp: {
    provider: 'fonnte' | 'wablas';
    apiKey: string;
  };
}

/**
 * Camera Error Types
 *
 * Complete typed error hierarchy for the camera module.
 * All errors include structured context for debugging and telemetry.
 */

// ============================================================================
// Error Context Types
// ============================================================================

export interface CameraErrorContext {
  /** Operation being performed when error occurred */
  operation: string;
  /** Session ID if applicable */
  sessionId?: string;
  /** Photo sequence number if applicable */
  sequenceNumber?: number;
  /** Camera state at time of error */
  cameraState?: string;
  /** Error timestamp (ISO string) */
  timestamp: string;
  /** Stack trace */
  stack?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

// ============================================================================
// Base Camera Error
// ============================================================================

export class CameraError extends Error {
  public readonly context: CameraErrorContext;
  public readonly timestamp: string;

  constructor(
    message: string,
    context: Partial<CameraErrorContext> & { operation: string },
  ) {
    super(message);
    this.name = "CameraError";
    this.timestamp = new Date().toISOString();
    this.context = {
      ...context,
      timestamp: context.timestamp || this.timestamp,
      stack: context.stack || this.stack,
    } as CameraErrorContext;

    // Ensure prototype chain is correct
    Object.setPrototypeOf(this, CameraError.prototype);
  }

  /**
   * Get formatted error details for logging
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      timestamp: this.timestamp,
      context: this.context,
    };
  }
}

// ============================================================================
// Connection Errors
// ============================================================================

export class CameraNotConnectedError extends CameraError {
  constructor(context?: Partial<Omit<CameraErrorContext, "timestamp">>) {
    super("Camera not connected", {
      operation: context?.operation || "unknown",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CameraNotConnectedError";
    Object.setPrototypeOf(this, CameraNotConnectedError.prototype);
  }
}

export class CameraNotInitializedError extends CameraError {
  constructor(operation: string, sessionId?: string) {
    super("Camera not initialized", {
      operation,
      sessionId,
      timestamp: new Date().toISOString(),
    });
    this.name = "CameraNotInitializedError";
    Object.setPrototypeOf(this, CameraNotInitializedError.prototype);
  }
}

export class CameraNotReadyError extends CameraError {
  public readonly reason: string;

  constructor(
    reason: string,
    context?: Partial<Omit<CameraErrorContext, "timestamp">>,
  ) {
    super(`Camera not ready: ${reason}`, {
      operation: context?.operation || "capture",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CameraNotReadyError";
    this.reason = reason;
    Object.setPrototypeOf(this, CameraNotReadyError.prototype);
  }
}

export class ReconnectFailedError extends CameraError {
  public readonly attempts: number;

  constructor(
    attempts: number,
    context?: Partial<Omit<CameraErrorContext, "timestamp">>,
  ) {
    super(`Camera reconnection failed after ${attempts} attempts`, {
      operation: context?.operation || "reconnect",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "ReconnectFailedError";
    this.attempts = attempts;
    Object.setPrototypeOf(this, ReconnectFailedError.prototype);
  }
}

// ============================================================================
// Capture Errors
// ============================================================================

export class CamerasBusyError extends CameraError {
  constructor(context?: Partial<Omit<CameraErrorContext, "timestamp">>) {
    super("Camera is busy with another operation", {
      operation: context?.operation || "capture",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CamerasBusyError";
    Object.setPrototypeOf(this, CamerasBusyError.prototype);
  }
}

export class CaptureTimeoutError extends CameraError {
  public readonly timeoutMs: number;

  constructor(
    timeoutMs: number,
    context?: Partial<Omit<CameraErrorContext, "timestamp">>,
  ) {
    super(`Capture timed out after ${timeoutMs}ms`, {
      operation: context?.operation || "capture",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CaptureTimeoutError";
    this.timeoutMs = timeoutMs;
    Object.setPrototypeOf(this, CaptureTimeoutError.prototype);
  }
}

export class CaptureRetryExhaustedError extends CameraError {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(
    attempts: number,
    lastError: Error,
    context?: Partial<Omit<CameraErrorContext, "timestamp">>,
  ) {
    super(`Capture failed after ${attempts} retry attempts`, {
      operation: context?.operation || "capture",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CaptureRetryExhaustedError";
    this.attempts = attempts;
    this.lastError = lastError;
    Object.setPrototypeOf(this, CaptureRetryExhaustedError.prototype);
  }
}

// ============================================================================
// Storage/Card Errors
// ============================================================================

export class CardFullError extends CameraError {
  constructor(context?: Partial<Omit<CameraErrorContext, "timestamp">>) {
    super("SD card is full", {
      operation: context?.operation || "capture",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CardFullError";
    Object.setPrototypeOf(this, CardFullError.prototype);
  }
}

export class CardWriteError extends CameraError {
  constructor(context?: Partial<Omit<CameraErrorContext, "timestamp">>) {
    super("SD card write error", {
      operation: context?.operation || "capture",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CardWriteError";
    Object.setPrototypeOf(this, CardWriteError.prototype);
  }
}

export class CardNotPresentError extends CameraError {
  constructor(context?: Partial<Omit<CameraErrorContext, "timestamp">>) {
    super("No SD card present in camera", {
      operation: context?.operation || "capture",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CardNotPresentError";
    Object.setPrototypeOf(this, CardNotPresentError.prototype);
  }
}

// ============================================================================
// Image Errors
// ============================================================================

export class CorruptImageError extends CameraError {
  public readonly filePath: string;

  constructor(
    message: string,
    filePath: string,
    context?: Partial<Omit<CameraErrorContext, "timestamp">>,
  ) {
    super(`Corrupt image: ${message}`, {
      operation: context?.operation || "verify",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CorruptImageError";
    this.filePath = filePath;
    Object.setPrototypeOf(this, CorruptImageError.prototype);
  }
}

export class LiveViewError extends CameraError {
  constructor(
    message: string,
    context?: Partial<Omit<CameraErrorContext, "timestamp">>,
  ) {
    super(`Live view error: ${message}`, {
      operation: context?.operation || "liveview",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "LiveViewError";
    Object.setPrototypeOf(this, LiveViewError.prototype);
  }
}

// ============================================================================
// EDSDK FFI Errors
// ============================================================================

export class EdsSdkNullError extends CameraError {
  public readonly edsContext: string;

  constructor(
    contextStr: string,
    sdkContext?: Partial<Omit<CameraErrorContext, "timestamp">>,
  ) {
    super(`Null return from EDSDK: ${contextStr}`, {
      operation: sdkContext?.operation || "edsdk_call",
      ...sdkContext,
      timestamp: new Date().toISOString(),
    });
    this.name = "EdsSdkNullError";
    this.edsContext = contextStr;
    Object.setPrototypeOf(this, EdsSdkNullError.prototype);
  }
}

export class EdsSdkError extends CameraError {
  public readonly edsSdkCode: number;
  public readonly edsSdkMessage: string;

  constructor(
    code: number,
    message: string,
    context?: Partial<Omit<CameraErrorContext, "timestamp">>,
  ) {
    super(`EDSDK Error: ${message} (0x${code.toString(16).padStart(8, "0")})`, {
      operation: context?.operation || "edsdk_call",
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "EdsSdkError";
    this.edsSdkCode = code;
    this.edsSdkMessage = message;
    Object.setPrototypeOf(this, EdsSdkError.prototype);
  }
}

// ============================================================================
// Error Code Mapping
// ============================================================================

import * as C from "./bindings/constants";

/**
 * Map EDSDK error codes to typed errors
 */
export function mapEdsErrorToTypedError(
  code: number,
  context?: Partial<Omit<CameraErrorContext, "timestamp">>,
): CameraError {
  const message = C.edsErrorToString(code);

  switch (code) {
    case C.EDS_ERR_DEVICE_MEMORY_FULL:
      return new CardFullError(context);

    case C.EDS_ERR_FILE_WRITE_ERROR:
    case C.EDS_ERR_FILE_PERMISSION_ERROR:
      return new CardWriteError(context);

    case C.EDS_ERR_TAKE_PICTURE_NO_CARD_NG:
      return new CardNotPresentError(context);

    case C.EDS_ERR_DEVICE_BUSY:
      return new CamerasBusyError(context);

    case C.EDS_ERR_DEVICE_NOT_FOUND:
    case C.EDS_ERR_SESSION_NOT_OPEN:
      return new CameraNotConnectedError(context);

    default:
      return new EdsSdkError(code, message, context);
  }
}

/**
 * Check if an error is retryable (transient)
 */
export function isRetryableError(error: Error): boolean {
  if (error instanceof CameraError) {
    // Transient errors that warrant a retry
    if (error instanceof EdsSdkError) {
      const retryableCodes = [
        C.EDS_ERR_COMM_USB_BUS_ERR,
        C.EDS_ERR_DEVICE_BUSY,
        C.EDS_ERR_TAKE_PICTURE_AF_NG,
        C.EDS_ERR_OPERATION_CANCELLED,
      ];
      return retryableCodes.includes(error.edsSdkCode);
    }

    // Network/connection errors are retryable
    if (error instanceof CameraNotConnectedError) {
      return true;
    }
  }

  return false;
}

/**
 * Check if an error is fatal (should not retry)
 */
export function isFatalError(error: Error): boolean {
  if (error instanceof CardFullError) return true;
  if (error instanceof CardNotPresentError) return true;
  if (error instanceof CorruptImageError) return false; // Can retry
  if (error instanceof CaptureTimeoutError) return true;

  return false;
}

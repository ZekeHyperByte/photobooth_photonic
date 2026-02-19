/**
 * Camera error types and rich error context for debugging
 */

export interface CameraErrorContext {
  /** Operation being performed when error occurred */
  operation: string;
  /** Session ID if applicable */
  sessionId?: string;
  /** Photo sequence number if applicable */
  sequenceNumber?: number;
  /** Camera state at time of error */
  cameraState?: string;
  /** Error timestamp */
  timestamp: string;
  /** Stack trace */
  stack?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Base camera error class with rich context
 */
export class CameraError extends Error {
  public readonly context: CameraErrorContext;

  constructor(message: string, context: CameraErrorContext) {
    super(message);
    this.name = "CameraError";
    this.context = context;

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
      context: this.context,
    };
  }
}

/**
 * Camera not initialized error
 */
export class CameraNotInitializedError extends CameraError {
  constructor(operation: string) {
    super("Camera not initialized", {
      operation,
      timestamp: new Date().toISOString(),
    });
    this.name = "CameraNotInitializedError";
    Object.setPrototypeOf(this, CameraNotInitializedError.prototype);
  }
}

/**
 * Camera busy error (for retry logic)
 */
export class CameraBusyError extends CameraError {
  constructor(context: Omit<CameraErrorContext, "timestamp">) {
    super("Camera is busy", {
      ...context,
      timestamp: new Date().toISOString(),
    });
    this.name = "CameraBusyError";
    Object.setPrototypeOf(this, CameraBusyError.prototype);
  }
}

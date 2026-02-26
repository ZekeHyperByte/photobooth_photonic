/**
 * Camera State Machine Types
 * 
 * Type definitions for the event-driven state machine architecture.
 */

import { CameraError } from "../errors";

// ============================================================================
// State Machine States
// ============================================================================

export type CameraState =
  | "IDLE"
  | "INITIALIZING"
  | "CONNECTED"
  | "ENTERING_LIVEVIEW"
  | "LIVEVIEW"
  | "CAPTURING"
  | "DOWNLOADING"
  | "EXITING_LIVEVIEW"
  | "DISCONNECTING"
  | "ERROR";

export const VALID_STATES: CameraState[] = [
  "IDLE",
  "INITIALIZING",
  "CONNECTED",
  "ENTERING_LIVEVIEW",
  "LIVEVIEW",
  "CAPTURING",
  "DOWNLOADING",
  "EXITING_LIVEVIEW",
  "DISCONNECTING",
  "ERROR",
];

// ============================================================================
// State Transitions
// ============================================================================

export interface StateTransition {
  from: CameraState;
  to: CameraState;
  guard?: () => boolean | Promise<boolean>;
}

// Valid state transitions
export const VALID_TRANSITIONS: StateTransition[] = [
  // Initialization
  { from: "IDLE", to: "INITIALIZING" },
  { from: "INITIALIZING", to: "CONNECTED" },
  { from: "INITIALIZING", to: "ERROR" },

  // Live view entry
  { from: "CONNECTED", to: "ENTERING_LIVEVIEW" },
  { from: "ENTERING_LIVEVIEW", to: "LIVEVIEW" },
  { from: "ENTERING_LIVEVIEW", to: "ERROR" },

  // Capture flow
  { from: "LIVEVIEW", to: "CAPTURING" },
  { from: "CAPTURING", to: "DOWNLOADING" },
  { from: "DOWNLOADING", to: "LIVEVIEW" },
  { from: "CAPTURING", to: "LIVEVIEW" }, // Capture failed, return to live view
  { from: "CAPTURING", to: "ERROR" },
  { from: "DOWNLOADING", to: "ERROR" },

  // Live view exit
  { from: "LIVEVIEW", to: "EXITING_LIVEVIEW" },
  { from: "EXITING_LIVEVIEW", to: "CONNECTED" },
  { from: "EXITING_LIVEVIEW", to: "ERROR" },

  // Disconnection
  { from: "CONNECTED", to: "DISCONNECTING" },
  { from: "LIVEVIEW", to: "DISCONNECTING" },
  { from: "ERROR", to: "DISCONNECTING" },
  { from: "DISCONNECTING", to: "IDLE" },

  // Error recovery
  { from: "ERROR", to: "INITIALIZING" }, // Recovery attempt
];

export function isValidTransition(from: CameraState, to: CameraState): boolean {
  return VALID_TRANSITIONS.some(
    (t) => t.from === from && t.to === to
  );
}

// ============================================================================
// Events
// ============================================================================

export type CameraEventType =
  | "stateChanged"
  | "frameCaptured"
  | "captureComplete"
  | "captureError"
  | "error"
  | "disconnected"
  | "propertyChanged";

export interface StateChangedEvent {
  type: "stateChanged";
  from: CameraState;
  to: CameraState;
  timestamp: number;
}

export interface LiveViewFrame {
  data: Buffer;
  timestamp: number;
  sequence: number;
  width?: number;
  height?: number;
}

export interface FrameCapturedEvent {
  type: "frameCaptured";
  frame: LiveViewFrame;
}

export interface CaptureCompleteEvent {
  type: "captureComplete";
  filePath: string;
  metadata: CaptureMetadata;
}

export interface CaptureErrorEvent {
  type: "captureError";
  error: CameraError;
  sessionId?: string;
  sequenceNumber?: number;
}

export interface ErrorEvent {
  type: "error";
  error: CameraError;
  fatal: boolean;
}

export interface DisconnectedEvent {
  type: "disconnected";
  reason?: string;
}

export interface PropertyChangedEvent {
  type: "propertyChanged";
  propertyId: number;
  value: any;
  previousValue?: any;
}

export type CameraEvent =
  | StateChangedEvent
  | FrameCapturedEvent
  | CaptureCompleteEvent
  | CaptureErrorEvent
  | ErrorEvent
  | DisconnectedEvent
  | PropertyChangedEvent;

export type CameraEventHandler = (event: CameraEvent) => void | Promise<void>;

// ============================================================================
// Live View Types
// ============================================================================

export interface LiveViewStats {
  fps: number;
  targetFps: number;
  totalFrames: number;
  droppedFrames: number;
  lastFrameTime: number;
  averageFrameTime: number;
  bufferSize: number;
}

export interface LiveViewConfig {
  targetFps: number;
  bufferSize: number; // Number of frames to buffer
  frameTimeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export const DEFAULT_LIVEVIEW_CONFIG: LiveViewConfig = {
  targetFps: 30,
  bufferSize: 2, // Keep last 2 frames
  frameTimeoutMs: 5000,
  retryAttempts: 3,
  retryDelayMs: 500,
};

// ============================================================================
// Capture Types
// ============================================================================

export interface CaptureMetadata {
  model: string;
  timestamp: string;
  iso?: string;
  shutterSpeed?: string;
  aperture?: string;
  focalLength?: string;
  width?: number;
  height?: number;
}

export interface CaptureResult {
  filePath: string;
  metadata: CaptureMetadata;
}

export interface CaptureConfig {
  timeoutMs: number;
  downloadTimeoutMs: number;
  saveToHost: boolean;
  outputDirectory: string;
}

// ============================================================================
// State Synchronization Types
// ============================================================================

export interface SyncConfig {
  pollIntervalMs: number;
  timeoutMs: number;
  maxRetries: number;
  retryDelayMs: number;
}

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  pollIntervalMs: 100,
  timeoutMs: 5000,
  maxRetries: 5,
  retryDelayMs: 200,
};

export interface PropertyWaitResult<T> {
  success: boolean;
  value?: T;
  attempts: number;
  elapsedMs: number;
}

// ============================================================================
// Session Management Types
// ============================================================================

export interface SessionConfig {
  sdkVersion: string;
  dllPath: string;
  edsImagePath: string;
}

export interface TrackedObject {
  ref: any;
  type: string;
  createdAt: number;
}

// ============================================================================
// Error Types
// ============================================================================

export class StateTransitionError extends CameraError {
  constructor(
    public readonly from: CameraState,
    public readonly to: CameraState,
    context?: Record<string, any>
  ) {
    super(`Invalid state transition from ${from} to ${to}`, {
      operation: "stateTransition",
      ...context,
    });
    this.name = "StateTransitionError";
  }
}

export class StateTimeoutError extends CameraError {
  constructor(
    public readonly state: CameraState,
    public readonly timeoutMs: number,
    context?: Record<string, any>
  ) {
    super(`Timeout waiting for state ${state} after ${timeoutMs}ms`, {
      operation: "stateWait",
      ...context,
    });
    this.name = "StateTimeoutError";
  }
}

export class PropertySyncError extends CameraError {
  constructor(
    public readonly propertyId: number,
    public readonly expectedValue: any,
    public readonly actualValue: any,
    context?: Record<string, any>
  ) {
    super(
      `Property ${propertyId} sync failed: expected ${expectedValue}, got ${actualValue}`,
      {
        operation: "propertySync",
        ...context,
      }
    );
    this.name = "PropertySyncError";
  }
}

// ============================================================================
// Camera Information
// ============================================================================

export interface CameraInfo {
  model: string;
  portName: string;
  serialNumber?: string;
  firmwareVersion?: string;
  batteryLevel: number;
  availableShots: number;
}

export interface SdCardInfo {
  present: boolean;
  writeable: boolean;
  totalSpaceMB: number | null;
  freeSpaceMB: number | null;
}

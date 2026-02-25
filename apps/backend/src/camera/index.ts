/**
 * Camera Module
 * Provides camera control abstraction with EDSDK integration (Windows-only)
 */

// Types
export * from "./types";
export * from "./errors";

// Event Pump
export {
  CameraEventPump,
  getGlobalEventPump,
  stopGlobalEventPump,
} from "./event-pump";

// Watchdog
export { CameraWatchdog, type WatchdogStatus } from "./watchdog";

// Mutex
export { CaptureMutex, type CaptureQueueMode } from "./mutex";

// Providers
export { CameraProvider } from "./types";
export { MockProvider } from "./providers/mock";
export { EdsdkProvider } from "./providers/edsdk";
export { WebcamProvider } from "./providers/webcam";
export {
  createProvider,
  getAvailableProviders,
  getProviderDisplayName,
  ProviderType,
} from "./providers/factory";

// Logger
export { cameraLogger } from "./logger";

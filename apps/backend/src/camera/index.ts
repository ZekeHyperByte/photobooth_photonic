/**
 * Camera Module
 * Provides camera control abstraction with EDSDK integration (Windows-only)
 */

// Types
export * from "./types";
export * from "./errors";

// State Machine (New Architecture)
export * from "./state-machine";

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
export { EdsdkV2Provider } from "./providers/edsdk-v2";
export { WebcamProvider } from "./providers/webcam";
export {
  createProvider,
  getAvailableProviders,
  getProviderDisplayName,
  getRecommendedProvider,
  ProviderType,
} from "./providers/factory";

// Logger
export { cameraLogger } from "./logger";

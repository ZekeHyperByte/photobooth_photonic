/**
 * Camera Module
 * Talks to an external camera service over HTTP/WS (camera-win on Windows).
 */

// Types
export * from "./types";
export * from "./errors";

// Watchdog
export { CameraWatchdog, type WatchdogStatus } from "./watchdog";

// Mutex
export { CaptureMutex, type CaptureQueueMode } from "./mutex";

// Camera Manager
export {
  CameraManager,
  getCameraManager,
  resetCameraManager,
  type CameraManagerHealth,
} from "./camera-manager";

// Camera Provider (HTTP/WS client to the camera service)
export { HttpCameraProvider } from "./http-camera-provider";
export { CameraProvider } from "./types";

// Logger
export { cameraLogger } from "./logger";

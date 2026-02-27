/**
 * Camera Module
 * Python gphoto2 Only - Linux Deployment
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

// USB Reset
export {
  performCameraReset,
  resetGphoto2Processes,
  findCanonCamera,
  resetUSBBus,
  waitForCamera,
  isCameraAccessible,
  installUSBReset,
  type USBResetResult,
  type CameraUSBInfo,
} from "./usb-reset";

// Python gphoto2 Provider
export { PythonGPhoto2Provider } from "./python-gphoto2-provider";
export { CameraProvider } from "./types";

// Logger
export { cameraLogger } from "./logger";

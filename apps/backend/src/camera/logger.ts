import { createLogger } from "@photonic/utils";

/**
 * Camera module logger
 * Separate logger for camera operations with EDSDK-specific context
 */
export const cameraLogger = createLogger("camera");

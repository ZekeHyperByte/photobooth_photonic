/**
 * Camera Module
 * Provides camera control abstraction with EDSDK integration
 */

// Types
export * from "./types";
export * from "./errors";

// Providers
export { CameraProvider } from "./types";
export { MockProvider } from "./providers/mock";
export { EdsProvider } from "./providers/edsdk";
export {
  createProvider,
  getAvailableProviders,
  ProviderType,
} from "./providers/factory";

// Bindings
export * from "./bindings/constants";
export {
  loadEdsdk,
  initializeEdsdk,
  terminateEdsdk,
  isEdsdkInitialized,
  getEdsdk,
} from "./bindings";

// Logger
export { cameraLogger } from "./logger";

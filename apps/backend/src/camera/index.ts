/**
 * Camera Module
 * Provides camera control abstraction with gPhoto2 integration
 */

// Types
export * from "./types";
export * from "./errors";

// Providers
export { CameraProvider } from "./types";
export { MockProvider } from "./providers/mock";
export { GPhoto2Provider } from "./providers/gphoto2";
export {
  createProvider,
  getAvailableProviders,
  ProviderType,
} from "./providers/factory";

// Logger
export { cameraLogger } from "./logger";

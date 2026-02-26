/**
 * Camera Provider Factory
 * Creates appropriate camera provider based on configuration
 */

import { CameraProvider } from "../types";
import { MockProvider } from "./mock";
import { EdsdkProvider } from "./edsdk";
import { EdsdkV2Provider } from "./edsdk-v2";
import { WebcamProvider } from "./webcam";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";

export type ProviderType = "edsdk" | "edsdk-v2" | "mock" | "webcam";

/**
 * Create a camera provider instance
 */
export function createProvider(type?: ProviderType): CameraProvider {
  const providerType = type || (env.cameraProvider as ProviderType) || "mock";

  cameraLogger.info("CameraProviderFactory: Creating provider", {
    type: providerType,
    platform: process.platform,
  });

  switch (providerType) {
    case "edsdk-v2":
      cameraLogger.info("CameraProviderFactory: Using new EDSDK v2 provider (state machine)");
      return new EdsdkV2Provider();

    case "edsdk":
      cameraLogger.info("CameraProviderFactory: Using legacy EDSDK provider");
      return new EdsdkProvider();

    case "mock":
      return new MockProvider();

    case "webcam":
      return new WebcamProvider();

    default:
      cameraLogger.warn(`Unknown provider type: ${providerType}, using mock`);
      return new MockProvider();
  }
}

/**
 * Get available provider types for current platform
 */
export function getAvailableProviders(): ProviderType[] {
  const providers: ProviderType[] = ["mock", "webcam"];

  // EDSDK only available on Windows
  if (process.platform === "win32") {
    providers.push("edsdk-v2"); // New state machine provider
    providers.push("edsdk");    // Legacy provider
  }

  return providers;
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(type: ProviderType): string {
  switch (type) {
    case "edsdk-v2":
      return "Canon DSLR (EDSDK v2 - State Machine)";
    case "edsdk":
      return "Canon DSLR (EDSDK Legacy)";
    case "mock":
      return "Mock/Simulated Camera";
    case "webcam":
      return "Webcam/Browser Camera";
    default:
      return "Unknown";
  }
}

/**
 * Get recommended provider for a camera model
 */
export function getRecommendedProvider(cameraModel?: string): ProviderType {
  // For 550D and other older cameras, recommend the new v2 provider
  // which has better state synchronization
  if (cameraModel) {
    const model = cameraModel.toLowerCase();
    if (model.includes("550") || model.includes("rebel") || model.includes("t2i")) {
      return "edsdk-v2";
    }
  }

  // Default to new provider for all cameras
  return "edsdk-v2";
}

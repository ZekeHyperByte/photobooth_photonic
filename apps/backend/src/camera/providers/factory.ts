/**
 * Camera Provider Factory
 * Creates appropriate camera provider based on configuration
 */

import { CameraProvider } from "../types";
import { MockProvider } from "./mock";
import { EdsdkProvider } from "./edsdk";
import { WebcamProvider } from "./webcam";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";

export type ProviderType = "edsdk" | "mock" | "webcam";

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
    case "edsdk":
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
    providers.push("edsdk");
  }

  return providers;
}

/**
 * Get provider display name
 */
export function getProviderDisplayName(type: ProviderType): string {
  switch (type) {
    case "edsdk":
      return "Canon DSLR (EDSDK)";
    case "mock":
      return "Mock/Simulated Camera";
    case "webcam":
      return "Webcam/Browser Camera";
    default:
      return "Unknown";
  }
}

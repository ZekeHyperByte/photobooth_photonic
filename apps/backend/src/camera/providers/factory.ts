/**
 * Camera Provider Factory
 * Creates appropriate camera provider based on configuration
 */

import { CameraProvider } from "../types";
import { MockProvider } from "./mock";
import { GPhoto2Provider } from "./gphoto2";
import { EdsdkProvider } from "./edsdk";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";

export type ProviderType = "edsdk" | "gphoto2" | "mock";

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

    case "gphoto2":
      return new GPhoto2Provider();

    case "mock":
      return new MockProvider();

    default:
      cameraLogger.warn(`Unknown provider type: ${providerType}, using mock`);
      return new MockProvider();
  }
}

/**
 * Get available provider types for current platform
 */
export function getAvailableProviders(): ProviderType[] {
  return ["mock", "gphoto2", "edsdk"];
}

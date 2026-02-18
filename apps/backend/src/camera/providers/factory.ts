/**
 * Camera Provider Factory
 * Creates appropriate camera provider based on configuration
 */

import { CameraProvider } from "../types";
import { MockProvider } from "./mock";
import { EdsProvider } from "./edsdk";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";

export type ProviderType = "edsdk" | "mock";

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
      if (process.platform !== "win32") {
        cameraLogger.warn(
          "EDSDK provider requested but not on Windows, falling back to mock",
        );
        return new MockProvider();
      }
      return new EdsProvider();

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
  const providers: ProviderType[] = ["mock"];

  if (process.platform === "win32") {
    providers.push("edsdk");
  }

  return providers;
}

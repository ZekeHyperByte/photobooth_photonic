/**
 * Camera Provider Factory
 * Creates appropriate camera provider based on configuration
 */

import { CameraProvider } from "../types";
import { MockProvider } from "./mock";
import { EdsdkProvider } from "./edsdk";
import { EdsdkV2Provider } from "./edsdk-v2";
import { Gphoto2Provider } from "./gphoto2";
import { PythonGPhoto2Provider } from "./python-gphoto2";
import { WebcamProvider } from "./webcam";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";

export type ProviderType =
  | "edsdk"
  | "edsdk-v2"
  | "gphoto2"
  | "python-gphoto2"
  | "mock"
  | "webcam";

/**
 * Create a camera provider instance
 * Automatically selects appropriate provider based on platform
 */
export function createProvider(type?: ProviderType): CameraProvider {
  // Auto-detect best provider if not specified
  let providerType = type || (env.cameraProvider as ProviderType);

  if (!providerType) {
    // Auto-select based on platform
    if (process.platform === "linux") {
      providerType = "gphoto2";
    } else if (process.platform === "win32") {
      providerType = "edsdk-v2";
    } else {
      providerType = "mock";
    }
  }

  cameraLogger.info("CameraProviderFactory: Creating provider", {
    type: providerType,
    platform: process.platform,
  });

  switch (providerType) {
    case "edsdk-v2":
      cameraLogger.info(
        "CameraProviderFactory: Using EDSDK v2 provider (state machine)",
      );
      return new EdsdkV2Provider();

    case "edsdk":
      cameraLogger.info("CameraProviderFactory: Using legacy EDSDK provider");
      return new EdsdkProvider();

    case "gphoto2":
      cameraLogger.info(
        "CameraProviderFactory: Using gphoto2 provider (Linux)",
      );
      return new Gphoto2Provider();

    case "python-gphoto2":
      cameraLogger.info(
        "CameraProviderFactory: Using Python gphoto2 service provider (Linux - Fast)",
      );
      return new PythonGPhoto2Provider();

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

  if (process.platform === "linux") {
    providers.push("gphoto2"); // Linux Canon support (CLI-based)
    providers.push("python-gphoto2"); // Linux Canon support (Python service - faster)
  } else if (process.platform === "win32") {
    providers.push("edsdk-v2"); // Windows state machine provider
    providers.push("edsdk"); // Windows legacy provider
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
    case "gphoto2":
      return "Canon DSLR (gphoto2 CLI - Linux)";
    case "python-gphoto2":
      return "Canon DSLR (Python Service - Linux Fast Mode)";
    case "mock":
      return "Mock/Simulated Camera";
    case "webcam":
      return "Webcam/Browser Camera";
    default:
      return "Unknown";
  }
}

/**
 * Get recommended provider for current platform and camera model
 */
export function getRecommendedProvider(cameraModel?: string): ProviderType {
  // Platform-specific defaults
  if (process.platform === "linux") {
    return "gphoto2";
  }

  if (process.platform === "win32") {
    // For 550D and other older cameras on Windows, recommend the new v2 provider
    // which has better state synchronization
    if (cameraModel) {
      const model = cameraModel.toLowerCase();
      if (
        model.includes("550") ||
        model.includes("rebel") ||
        model.includes("t2i")
      ) {
        return "edsdk-v2";
      }
    }
    return "edsdk-v2";
  }

  // Default to mock for unsupported platforms
  return "mock";
}

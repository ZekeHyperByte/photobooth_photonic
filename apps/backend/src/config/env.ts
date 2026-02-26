import dotenv from "dotenv";
import path from "path";
import { ENV_KEYS } from "@photonic/config";

// Load environment variables
dotenv.config();

// Check for deprecated environment variables and log warnings
function checkDeprecatedEnvVars(): void {
  const deprecated: { old: string; new: string; action: string }[] = [];

  if (process.env.MOCK_CAMERA) {
    deprecated.push({
      old: "MOCK_CAMERA",
      new: "CAMERA_PROVIDER=mock",
      action: "Set CAMERA_PROVIDER=mock instead",
    });
  }

  if (process.env.USE_WEBCAM) {
    deprecated.push({
      old: "USE_WEBCAM",
      new: "CAMERA_PROVIDER=webcam",
      action: "Set CAMERA_PROVIDER=webcam instead",
    });
  }

  if (deprecated.length > 0) {
    console.warn("\n⚠️  DEPRECATED ENVIRONMENT VARIABLES DETECTED:");
    console.warn("=".repeat(60));
    for (const dep of deprecated) {
      console.warn(`  • ${dep.old} is deprecated`);
      console.warn(`    → Use: ${dep.new}`);
      console.warn(`    → Action: ${dep.action}`);
    }
    console.warn("=".repeat(60) + "\n");
  }
}

// Check deprecated vars on load
checkDeprecatedEnvVars();

export const env: {
  nodeEnv: string;
  port: number;
  databasePath: string;
  tempPhotoPath: string;
  processedPath: string;
  templatesPath: string;
  thumbnailsPath: string;
  cameraProvider:
    | "edsdk"
    | "edsdk-v2"
    | "gphoto2"
    | "python-gphoto2"
    | "webcam"
    | "mock";
  pythonCameraServiceUrl: string;
  pythonCameraServiceWsUrl: string;
  captureTimeoutMs: number;
  captureQueueMode: "queue" | "reject";
  liveViewFps: number;
  liveViewTransport: "ipc" | "http";
  edsdkLibPath?: string;
  payment: {
    provider: "mock" | "midtrans" | "xendit" | "stripe";
    midtrans?: {
      serverKey: string;
      clientKey: string;
      environment: "sandbox" | "production";
    };
  };
  whatsapp: {
    enabled: boolean;
    provider: "fonnte" | "wablas";
    apiKey: string;
  };
  sync: {
    boothId: string;
    centralServerUrl: string;
    centralServerApiKey: string;
    syncIntervalMs: number;
  };
  admin: {
    pin: string;
    port: number;
  };
  mockFailureMode: string;
  isDevelopment: boolean;
  isProduction: boolean;
  devMode: boolean;
} = {
  nodeEnv: process.env[ENV_KEYS.NODE_ENV] || "development",
  port: parseInt(process.env[ENV_KEYS.BACKEND_PORT] || "4000", 10),
  databasePath: process.env[ENV_KEYS.DATABASE_PATH] || "./data/photobooth.db",

  // Camera settings (consolidated)
  tempPhotoPath: process.env.TEMP_PHOTO_PATH || "./data/photos",
  processedPath: process.env.PROCESSED_PATH || "./data/processed",
  templatesPath: process.env.TEMPLATES_PATH || "./data/templates",
  thumbnailsPath: process.env.THUMBNAILS_PATH || "./data/thumbnails",

  // Camera provider: 'edsdk' | 'edsdk-v2' | 'gphoto2' | 'python-gphoto2' | 'webcam' | 'mock'
  // Auto-detected based on platform if not specified:
  // - Linux: python-gphoto2 (Python service - fast)
  // - Windows: edsdk-v2
  // - Other: mock
  cameraProvider: (process.env.CAMERA_PROVIDER ||
    (process.platform === "linux"
      ? "python-gphoto2"
      : process.platform === "win32"
        ? "edsdk-v2"
        : "mock")) as
    | "edsdk"
    | "edsdk-v2"
    | "gphoto2"
    | "python-gphoto2"
    | "webcam"
    | "mock",

  // Python Camera Service (for gphoto2 provider)
  pythonCameraServiceUrl:
    process.env.PYTHON_CAMERA_SERVICE_URL || "http://localhost:8000",
  pythonCameraServiceWsUrl:
    process.env.PYTHON_CAMERA_SERVICE_WS_URL || "ws://localhost:8000",

  // Capture settings
  captureTimeoutMs: parseInt(process.env.CAPTURE_TIMEOUT_MS || "30000", 10),
  captureQueueMode: (process.env.CAPTURE_QUEUE_MODE || "reject") as
    | "queue"
    | "reject",

  // Live view settings
  liveViewFps: parseInt(process.env.LIVEVIEW_FPS || "24", 10),
  liveViewTransport: (process.env.LIVEVIEW_TRANSPORT || "http") as
    | "ipc"
    | "http",

  // EDSDK library path (optional override)
  edsdkLibPath: process.env.EDSDK_LIB_PATH,

  // Payment configuration
  payment: {
    provider: (process.env[ENV_KEYS.PAYMENT_PROVIDER] || "mock") as
      | "mock"
      | "midtrans"
      | "xendit"
      | "stripe",

    midtrans: process.env[ENV_KEYS.MIDTRANS_SERVER_KEY]
      ? {
          serverKey: process.env[ENV_KEYS.MIDTRANS_SERVER_KEY] || "",
          clientKey: process.env[ENV_KEYS.MIDTRANS_CLIENT_KEY] || "",
          environment: (process.env[ENV_KEYS.MIDTRANS_ENVIRONMENT] ||
            "sandbox") as "sandbox" | "production",
        }
      : undefined,
  },

  whatsapp: {
    enabled: !!process.env[ENV_KEYS.WHATSAPP_API_KEY],
    provider: (process.env[ENV_KEYS.WHATSAPP_PROVIDER] || "fonnte") as
      | "fonnte"
      | "wablas",
    apiKey: process.env[ENV_KEYS.WHATSAPP_API_KEY] || "",
  },

  // Sync settings for central analytics
  sync: {
    boothId: process.env.BOOTH_ID || "booth-001",
    centralServerUrl: process.env.CENTRAL_SERVER_URL || "",
    centralServerApiKey: process.env.CENTRAL_SERVER_API_KEY || "",
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || "3600000", 10),
  },

  // Admin settings
  admin: {
    pin: process.env.ADMIN_PIN || "1234",
    port: parseInt(process.env.ADMIN_PORT || "4001", 10),
  },

  // Mock provider failure simulation mode
  mockFailureMode: process.env.MOCK_FAILURE_MODE || "none",

  isDevelopment: process.env[ENV_KEYS.NODE_ENV] === "development",
  isProduction: process.env[ENV_KEYS.NODE_ENV] === "production",
  devMode: process.env[ENV_KEYS.DEV_MODE] === "true",
};

/**
 * Validate required environment variables
 */
export function validateEnv() {
  const missing: string[] = [];
  const warnings: string[] = [];

  // Check payment configuration
  if (env.payment.provider === "midtrans") {
    if (!env.payment.midtrans?.serverKey) {
      missing.push("MIDTRANS_SERVER_KEY");
    }
    if (!env.payment.midtrans?.clientKey) {
      missing.push("MIDTRANS_CLIENT_KEY");
    }
  }

  // Warn if using mock provider in production
  if (env.isProduction && env.payment.provider === "mock") {
    warnings.push(
      "Using mock payment provider in production - no real payments will be processed",
    );
  }

  // Warn if using mock camera in production
  if (env.isProduction && env.cameraProvider === "mock") {
    warnings.push(
      "Using mock camera provider in production - no real photos will be taken",
    );
  }

  // Info message for gphoto2 on Linux
  if (env.cameraProvider === "gphoto2") {
    console.info("📷 Using gphoto2 provider for Canon camera control on Linux");
  }

  if (missing.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missing.join(", ")}`,
    );
    console.warn("Some features may not work correctly.");
  }

  if (warnings.length > 0) {
    console.warn("Warnings:");
    warnings.forEach((w) => console.warn(`  - ${w}`));
  }

  return missing.length === 0;
}

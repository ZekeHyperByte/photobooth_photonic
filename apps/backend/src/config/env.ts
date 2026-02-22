import dotenv from "dotenv";
import path from "path";
import { ENV_KEYS } from "@photonic/config";

// Load environment variables
dotenv.config();

export const env: {
  nodeEnv: string;
  port: number;
  databasePath: string;
  tempPhotoPath: string;
  mockCamera: boolean;
  useWebcam: boolean;
  cameraProvider: "edsdk" | "gphoto2" | "mock";
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
  isDevelopment: boolean;
  isProduction: boolean;
  devMode: boolean;
} = {
  nodeEnv: process.env[ENV_KEYS.NODE_ENV] || "development",
  port: parseInt(process.env[ENV_KEYS.BACKEND_PORT] || "4000", 10),
  databasePath: process.env[ENV_KEYS.DATABASE_PATH] || "./data/photobooth.db",

  // Camera settings (merged from bridge)
  tempPhotoPath: process.env[ENV_KEYS.TEMP_PHOTO_PATH] || "./temp",
  mockCamera: process.env[ENV_KEYS.MOCK_CAMERA] === "true",
  useWebcam: process.env[ENV_KEYS.USE_WEBCAM] === "true",
  cameraProvider: (process.env.CAMERA_PROVIDER || "mock") as "edsdk" | "gphoto2" | "mock",
  edsdkLibPath: process.env.EDSDK_LIB_PATH,

  // Payment configuration
  payment: {
    // Default to mock provider if not specified
    provider: (process.env[ENV_KEYS.PAYMENT_PROVIDER] || "mock") as
      | "mock"
      | "midtrans"
      | "xendit"
      | "stripe",

    // Midtrans configuration (only used if provider is 'midtrans')
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
    syncIntervalMs: parseInt(process.env.SYNC_INTERVAL_MS || "3600000", 10), // 1 hour default
  },

  // Admin settings
  admin: {
    pin: process.env.ADMIN_PIN || "1234",
    port: parseInt(process.env.ADMIN_PORT || "4001", 10),
  },

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

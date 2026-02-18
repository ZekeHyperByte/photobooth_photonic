/**
 * EDSDK FFI Bindings
 * Loads EDSDK.dll and provides typed access to all functions
 */

import ffi from "ffi-napi";
import path from "path";
import { cameraLogger } from "../logger";
import { edsdkFunctions } from "./functions";

let edsdk: any = null;
let isInitialized = false;

/**
 * Get the path to the EDSDK DLL
 */
function getDllPath(): string {
  // In production (Electron), DLLs are in resources/dlls
  const electronProcess = process as any;
  if (electronProcess.resourcesPath) {
    return path.join(electronProcess.resourcesPath, "dlls", "EDSDK.dll");
  }

  // In development, use local dlls folder
  return path.join(__dirname, "../../../dlls", "EDSDK.dll");
}

/**
 * Load and initialize EDSDK
 */
export function loadEdsdk(): any {
  if (edsdk) {
    return edsdk;
  }

  const dllPath = getDllPath();
  cameraLogger.info("Loading EDSDK from:", dllPath);

  try {
    edsdk = ffi.Library(dllPath, edsdkFunctions);
    cameraLogger.info("EDSDK DLL loaded successfully");
    return edsdk;
  } catch (error: any) {
    cameraLogger.error("Failed to load EDSDK DLL:", error.message);
    throw new Error(
      `Failed to load EDSDK DLL from ${dllPath}: ${error.message}`,
    );
  }
}

/**
 * Initialize EDSDK
 */
export function initializeEdsdk(): void {
  if (isInitialized) {
    return;
  }

  const lib = loadEdsdk();

  cameraLogger.info("Initializing EDSDK...");
  const result = lib.EdsInitializeSDK();

  if (result !== 0) {
    const error = new Error(
      `EDSDK initialization failed with error: 0x${result.toString(16)}`,
    );
    cameraLogger.error("EDSDK initialization failed:", error.message);
    throw error;
  }

  isInitialized = true;
  cameraLogger.info("EDSDK initialized successfully");
}

/**
 * Terminate EDSDK
 */
export function terminateEdsdk(): void {
  if (!isInitialized || !edsdk) {
    return;
  }

  cameraLogger.info("Terminating EDSDK...");
  const result = edsdk.EdsTerminateSDK();

  if (result !== 0) {
    cameraLogger.warn("EDSDK termination returned error:", result);
  } else {
    cameraLogger.info("EDSDK terminated successfully");
  }

  isInitialized = false;
  edsdk = null;
}

/**
 * Check if EDSDK is initialized
 */
export function isEdsdkInitialized(): boolean {
  return isInitialized;
}

/**
 * Get EDSDK library instance
 */
export function getEdsdk(): any {
  if (!edsdk) {
    throw new Error("EDSDK not loaded. Call loadEdsdk() first.");
  }
  return edsdk;
}

// Auto-initialize on import (for fail-fast behavior)
if (process.platform === "win32") {
  try {
    initializeEdsdk();
  } catch (error) {
    cameraLogger.error("Failed to auto-initialize EDSDK:", error);
    // Don't throw here - let the provider handle it
  }
}

// Cleanup on process exit
process.on("exit", () => {
  terminateEdsdk();
});

process.on("SIGINT", () => {
  terminateEdsdk();
  process.exit(0);
});

process.on("SIGTERM", () => {
  terminateEdsdk();
  process.exit(0);
});

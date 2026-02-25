/**
 * EDSDK FFI Bindings (Windows-only)
 *
 * Dynamic loading of Canon EDSDK shared library (EDSDK.dll)
 * using koffi (a simpler, more reliable FFI library than node-ffi-napi).
 *
 * This module binds to the Canon EDSDK C API and exposes typed functions
 * for use by the EdsdkProvider.
 */

import koffi from "koffi";
import path from "path";
import os from "os";
import fs from "fs";
import { cameraLogger } from "../logger";

// ============================================================================
// SDK Version Configuration
// ============================================================================

export interface SdkVersionConfig {
  version: string;
  dllPath: string;
  compatibleModels: string[]; // regex patterns
}

export const SDK_VERSIONS: SdkVersionConfig[] = [
  {
    version: "13.20.10",
    dllPath: "packages/edsdk-native/win64/v13.20.10/EDSDK.dll",
    compatibleModels: ["EOS R.*", "EOS 90D", "850D", "250D"],
  },
  {
    version: "13.13.0",
    dllPath: "packages/edsdk-native/win64/v13.13.0/EDSDK.dll",
    compatibleModels: [
      "EOS 550D",
      "600D",
      "650D",
      "700D",
      "60D",
      "7D",
      "5D Mark II",
      "5D Mark III",
    ],
  },
];

// ============================================================================
// Type definitions for koffi
// ============================================================================

// Define opaque void pointer ONCE (koffi doesn't allow duplicate type names)
const Opaque = koffi.opaque("EdsOpaque");
const VoidPtr = koffi.pointer("EdsVoidPtr", Opaque);

// Opaque pointer types - EDSDK uses these as handles
const EdsBaseRef = koffi.pointer("EdsBaseRef", Opaque);
const EdsCameraListRef = koffi.pointer("EdsCameraListRef", Opaque);
const EdsCameraRef = koffi.pointer("EdsCameraRef", Opaque);
const EdsStreamRef = koffi.pointer("EdsStreamRef", Opaque);
const EdsEvfImageRef = koffi.pointer("EdsEvfImageRef", Opaque);
const EdsDirectoryItemRef = koffi.pointer("EdsDirectoryItemRef", Opaque);

// Struct: EdsDeviceInfo
const EdsDeviceInfo = koffi.struct("EdsDeviceInfo", {
  szPortName: koffi.array("char", 256),
  szDeviceDescription: koffi.array("char", 256),
  deviceSubType: "uint32",
  reserved: "uint32",
});

// Struct: EdsCapacity
const EdsCapacity = koffi.struct("EdsCapacity", {
  numberOfFreeClusters: "int32",
  bytesPerSector: "int32",
  reset: "int32",
});

// Struct: EdsDirectoryItemInfo
const EdsDirectoryItemInfo = koffi.struct("EdsDirectoryItemInfo", {
  size: "uint64",
  isFolder: "int32",
  groupID: "uint32",
  option: "uint32",
  szFileName: koffi.array("char", 256),
  format: "uint32",
  dateTime: "uint32",
});

// Callback types
const EdsObjectEventHandler = koffi.proto("EdsObjectEventHandler", "uint32", [
  "uint32",
  VoidPtr,
  VoidPtr,
]);

const EdsPropertyEventHandler = koffi.proto(
  "EdsPropertyEventHandler",
  "uint32",
  ["uint32", "uint32", "uint32", VoidPtr],
);

const EdsStateEventHandler = koffi.proto("EdsStateEventHandler", "uint32", [
  "uint32",
  "uint32",
  VoidPtr,
]);

// ============================================================================
// Library loading
// ============================================================================

let loadedVersion: string | null = null;
let loadedDllPath: string | null = null;

function findProjectRoot(): string {
  // Find project root by walking up from __dirname
  let projectRoot = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.resolve(projectRoot, "..");
    if (candidate === projectRoot) break;
    projectRoot = candidate;
    if (fs.existsSync(path.join(projectRoot, "packages"))) break;
    if (
      fs.existsSync(path.join(projectRoot, "apps")) &&
      fs.existsSync(path.join(projectRoot, "package.json"))
    )
      break;
  }
  return projectRoot;
}

export function getLibraryPath(versionConfig?: SdkVersionConfig): string {
  // Check environment variable first (highest priority)
  const envPath = process.env.EDSDK_LIB_PATH;
  if (envPath) {
    return envPath;
  }

  const platform = os.platform();

  // Windows-only support
  if (platform !== "win32") {
    throw new Error(
      `This application only supports Windows. Current platform: ${platform}`,
    );
  }

  const projectRoot = findProjectRoot();

  // If a specific version is requested, use it
  if (versionConfig) {
    const fullPath = path.join(projectRoot, versionConfig.dllPath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
    cameraLogger.warn(
      `Version ${versionConfig.version} DLL not found at ${fullPath}`,
    );
  }

  // Search SDK versions in order
  for (const sdkVersion of SDK_VERSIONS) {
    const fullPath = path.join(projectRoot, sdkVersion.dllPath);
    try {
      fs.accessSync(fullPath);
      cameraLogger.info(
        `Found EDSDK version ${sdkVersion.version} at ${fullPath}`,
      );
      return fullPath;
    } catch {
      continue;
    }
  }

  // Fallback to system PATH
  return "EDSDK.dll";
}

/**
 * Check if loaded SDK version matches camera model
 * Returns the optimal SDK version for the camera, or null if current is optimal
 */
export function checkSdkVersionCompatibility(cameraModel: string): {
  current: string;
  optimal: string | null;
  compatible: boolean;
} {
  const current = loadedVersion || "unknown";

  // Find the best SDK version for this camera
  for (const sdkVersion of SDK_VERSIONS) {
    for (const pattern of sdkVersion.compatibleModels) {
      const regex = new RegExp(pattern, "i");
      if (regex.test(cameraModel)) {
        const isCompatible = loadedVersion === sdkVersion.version;
        return {
          current,
          optimal: isCompatible ? null : sdkVersion.version,
          compatible: isCompatible,
        };
      }
    }
  }

  // Camera model not in known list - assume compatible
  return { current, optimal: null, compatible: true };
}

/**
 * Get loaded SDK version info
 */
export function getLoadedSdkInfo(): {
  version: string | null;
  dllPath: string | null;
} {
  return {
    version: loadedVersion,
    dllPath: loadedDllPath,
  };
}

// ============================================================================
// Safe call helpers
// ============================================================================

import { EdsSdkNullError } from "../errors";

export function safeEdsCall<T>(fn: () => T, context: string): T {
  const result = fn();
  if (result === null || result === undefined) {
    throw new EdsSdkNullError(context);
  }
  return result;
}

// ============================================================================
// Bind EDSDK functions
// ============================================================================

let lib: koffi.IKoffiLib | null = null;

export function loadEdsdkLibrary(
  versionConfig?: SdkVersionConfig,
): EdsdkBindings {
  const libPath = getLibraryPath(versionConfig);
  cameraLogger.info(`Loading EDSDK from: ${libPath}`);

  lib = koffi.load(libPath);
  loadedDllPath = libPath;

  // Determine version from path or use unknown
  for (const sdkVersion of SDK_VERSIONS) {
    if (libPath.includes(sdkVersion.version)) {
      loadedVersion = sdkVersion.version;
      break;
    }
  }
  if (!loadedVersion) {
    loadedVersion = "unknown";
  }

  cameraLogger.info(`EDSDK loaded: version ${loadedVersion} from ${libPath}`);

  return {
    // SDK lifecycle
    EdsInitializeSDK: lib.func("EdsInitializeSDK", "uint32", []),
    EdsTerminateSDK: lib.func("EdsTerminateSDK", "uint32", []),

    // Camera list
    EdsGetCameraList: lib.func("EdsGetCameraList", "uint32", [
      koffi.out(koffi.pointer(EdsCameraListRef)),
    ]),

    // Item tree
    EdsGetChildCount: lib.func("EdsGetChildCount", "uint32", [
      EdsBaseRef,
      koffi.out(koffi.pointer("uint32")),
    ]),
    EdsGetChildAtIndex: lib.func("EdsGetChildAtIndex", "uint32", [
      EdsBaseRef,
      "int32",
      koffi.out(koffi.pointer(EdsBaseRef)),
    ]),

    // Reference counting
    EdsRetain: lib.func("EdsRetain", "uint32", [EdsBaseRef]),
    EdsRelease: lib.func("EdsRelease", "uint32", [EdsBaseRef]),

    // Device info
    EdsGetDeviceInfo: lib.func("EdsGetDeviceInfo", "uint32", [
      EdsCameraRef,
      koffi.out(koffi.pointer(EdsDeviceInfo)),
    ]),

    // Session
    EdsOpenSession: lib.func("EdsOpenSession", "uint32", [EdsCameraRef]),
    EdsCloseSession: lib.func("EdsCloseSession", "uint32", [EdsCameraRef]),

    // Commands
    EdsSendCommand: lib.func("EdsSendCommand", "uint32", [
      EdsCameraRef,
      "uint32",
      "int32",
    ]),
    EdsSendStatusCommand: lib.func("EdsSendStatusCommand", "uint32", [
      EdsCameraRef,
      "uint32",
      "int32",
    ]),

    // Properties
    EdsGetPropertySize: lib.func("EdsGetPropertySize", "uint32", [
      EdsBaseRef,
      "uint32",
      "int32",
      koffi.out(koffi.pointer("uint32")),
      koffi.out(koffi.pointer("uint32")),
    ]),
    EdsGetPropertyData: lib.func("EdsGetPropertyData", "uint32", [
      EdsBaseRef,
      "uint32",
      "int32",
      "uint32",
      koffi.out(VoidPtr),
    ]),
    EdsSetPropertyData: lib.func("EdsSetPropertyData", "uint32", [
      EdsBaseRef,
      "uint32",
      "int32",
      "uint32",
      VoidPtr,
    ]),

    // Capacity
    EdsSetCapacity: lib.func("EdsSetCapacity", "uint32", [
      EdsCameraRef,
      EdsCapacity,
    ]),

    // Streams
    EdsCreateFileStream: lib.func("EdsCreateFileStream", "uint32", [
      "str",
      "uint32",
      "uint32",
      koffi.out(koffi.pointer(EdsStreamRef)),
    ]),
    EdsCreateMemoryStream: lib.func("EdsCreateMemoryStream", "uint32", [
      "uint64",
      koffi.out(koffi.pointer(EdsStreamRef)),
    ]),
    EdsGetPointer: lib.func("EdsGetPointer", "uint32", [
      EdsStreamRef,
      koffi.out(koffi.pointer(VoidPtr)),
    ]),
    EdsGetLength: lib.func("EdsGetLength", "uint32", [
      EdsStreamRef,
      koffi.out(koffi.pointer("uint64")),
    ]),

    // Download
    EdsDownload: lib.func("EdsDownload", "uint32", [
      EdsDirectoryItemRef,
      "uint64",
      EdsStreamRef,
    ]),
    EdsDownloadComplete: lib.func("EdsDownloadComplete", "uint32", [
      EdsDirectoryItemRef,
    ]),
    EdsDownloadCancel: lib.func("EdsDownloadCancel", "uint32", [
      EdsDirectoryItemRef,
    ]),
    EdsGetDirectoryItemInfo: lib.func("EdsGetDirectoryItemInfo", "uint32", [
      EdsDirectoryItemRef,
      koffi.out(koffi.pointer(EdsDirectoryItemInfo)),
    ]),

    // Live View (EVF)
    EdsCreateEvfImageRef: lib.func("EdsCreateEvfImageRef", "uint32", [
      EdsStreamRef,
      koffi.out(koffi.pointer(EdsEvfImageRef)),
    ]),
    EdsDownloadEvfImage: lib.func("EdsDownloadEvfImage", "uint32", [
      EdsCameraRef,
      EdsEvfImageRef,
    ]),

    // Event handlers
    EdsSetObjectEventHandler: lib.func("EdsSetObjectEventHandler", "uint32", [
      EdsCameraRef,
      "uint32",
      koffi.pointer(EdsObjectEventHandler),
      VoidPtr,
    ]),
    EdsSetPropertyEventHandler: lib.func(
      "EdsSetPropertyEventHandler",
      "uint32",
      [EdsCameraRef, "uint32", koffi.pointer(EdsPropertyEventHandler), VoidPtr],
    ),
    EdsSetStateEventHandler: lib.func(
      "EdsSetCameraStateEventHandler",
      "uint32",
      [EdsCameraRef, "uint32", koffi.pointer(EdsStateEventHandler), VoidPtr],
    ),

    // Event polling (Linux/console)
    EdsGetEvent: lib.func("EdsGetEvent", "uint32", []),
  };
}

// ============================================================================
// Type exports for use by EdsdkProvider
// ============================================================================

export interface EdsdkBindings {
  EdsInitializeSDK: () => number;
  EdsTerminateSDK: () => number;
  EdsGetCameraList: (outRef: any) => number;
  EdsGetChildCount: (ref: any, outCount: any) => number;
  EdsGetChildAtIndex: (ref: any, index: number, outRef: any) => number;
  EdsRetain: (ref: any) => number;
  EdsRelease: (ref: any) => number;
  EdsGetDeviceInfo: (camera: any, outInfo: any) => number;
  EdsOpenSession: (camera: any) => number;
  EdsCloseSession: (camera: any) => number;
  EdsSendCommand: (camera: any, command: number, param: number) => number;
  EdsSendStatusCommand: (camera: any, command: number, param: number) => number;
  EdsGetPropertySize: (
    ref: any,
    propId: number,
    param: number,
    outType: any,
    outSize: any,
  ) => number;
  EdsGetPropertyData: (
    ref: any,
    propId: number,
    param: number,
    size: number,
    outData: any,
  ) => number;
  EdsSetPropertyData: (
    ref: any,
    propId: number,
    param: number,
    size: number,
    data: any,
  ) => number;
  EdsSetCapacity: (camera: any, capacity: any) => number;
  EdsCreateFileStream: (
    name: string,
    disposition: number,
    access: number,
    outStream: any,
  ) => number;
  EdsCreateMemoryStream: (size: bigint, outStream: any) => number;
  EdsGetPointer: (stream: any, outPointer: any) => number;
  EdsGetLength: (stream: any, outLength: any) => number;
  EdsDownload: (item: any, size: bigint, stream: any) => number;
  EdsDownloadComplete: (item: any) => number;
  EdsDownloadCancel: (item: any) => number;
  EdsGetDirectoryItemInfo: (item: any, outInfo: any) => number;
  EdsCreateEvfImageRef: (stream: any, outEvf: any) => number;
  EdsDownloadEvfImage: (camera: any, evf: any) => number;
  EdsSetObjectEventHandler: (
    camera: any,
    event: number,
    handler: any,
    context: any,
  ) => number;
  EdsSetPropertyEventHandler: (
    camera: any,
    event: number,
    handler: any,
    context: any,
  ) => number;
  EdsSetStateEventHandler: (
    camera: any,
    event: number,
    handler: any,
    context: any,
  ) => number;
  EdsGetEvent: () => number;
}

export function unloadEdsdkLibrary(): void {
  if (lib) {
    lib = null;
    loadedVersion = null;
    loadedDllPath = null;
    cameraLogger.info("EDSDK library unloaded");
  }
}

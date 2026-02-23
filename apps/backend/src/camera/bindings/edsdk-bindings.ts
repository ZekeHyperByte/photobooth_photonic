/**
 * EDSDK FFI Bindings
 *
 * Dynamic loading of Canon EDSDK shared library (libEDSDK.so / EDSDK.dll)
 * using koffi (a simpler, more reliable FFI library than node-ffi-napi).
 *
 * This module binds to the Canon EDSDK C API and exposes typed functions
 * for use by the EdsdkProvider.
 */

import koffi from "koffi";
import path from "path";
import os from "os";
import { cameraLogger } from "../logger";

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
const EdsDirectoryItemRef = koffi.pointer(
    "EdsDirectoryItemRef",
    Opaque,
);

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
const EdsObjectEventHandler = koffi.proto(
    "EdsObjectEventHandler",
    "uint32",
    ["uint32", VoidPtr, VoidPtr],
);

const EdsPropertyEventHandler = koffi.proto(
    "EdsPropertyEventHandler",
    "uint32",
    ["uint32", "uint32", "uint32", VoidPtr],
);

const EdsStateEventHandler = koffi.proto(
    "EdsStateEventHandler",
    "uint32",
    ["uint32", "uint32", VoidPtr],
);

// ============================================================================
// Library loading
// ============================================================================

function getLibraryPath(): string {
    // Check environment variable first (highest priority)
    const envPath = process.env.EDSDK_LIB_PATH;
    if (envPath) {
        return envPath;
    }

    const platform = os.platform();
    const arch = os.arch();
    const fs = require("fs");

    // Project root is 4 levels up from __dirname (src/camera/bindings/)
    const projectRoot = path.resolve(__dirname, "../../../..");

    if (platform === "win32") {
        // Windows: search edsdk-deploy first, then fallback
        const searchPaths = [
            path.join(projectRoot, "edsdk-deploy", "v13.20.10-win64", "EDSDK.dll"),
            path.join(projectRoot, "edsdk-deploy", "v3.5", "EDSDK.dll"),
            path.join(projectRoot, "edsdk-deploy", "v2.14", "EDSDK.dll"),
            "EDSDK.dll", // System PATH fallback
        ];
        for (const p of searchPaths) {
            try {
                fs.accessSync(p);
                return p;
            } catch {
                continue;
            }
        }
        return "EDSDK.dll";
    } else if (platform === "linux") {
        const searchPaths =
            arch === "x64"
                ? [
                    path.join(projectRoot, "edsdk-deploy", "v13.20.10-linux", "x86_64", "libEDSDK.so"),
                    path.join(projectRoot, "EDSDK132010CDwithRAW(13.20.10)", "Linux", "EDSDK", "Library", "x86_64", "libEDSDK.so"),
                    "/usr/local/lib/libEDSDK.so",
                    "./libEDSDK.so",
                ]
                : [
                    path.join(projectRoot, "edsdk-deploy", "v13.20.10-linux", "ARM64", "libEDSDK.so"),
                    path.join(projectRoot, "EDSDK132010CDwithRAW(13.20.10)", "Linux", "EDSDK", "Library", "ARM64", "libEDSDK.so"),
                    "/usr/local/lib/libEDSDK.so",
                    "./libEDSDK.so",
                ];

        for (const p of searchPaths) {
            try {
                fs.accessSync(p);
                return p;
            } catch {
                continue;
            }
        }
        return "libEDSDK.so";
    } else if (platform === "darwin") {
        return "EDSDK.framework/EDSDK";
    }

    throw new Error(`Unsupported platform: ${platform}`);
}

// ============================================================================
// Bind EDSDK functions
// ============================================================================

let lib: koffi.IKoffiLib | null = null;

export function loadEdsdkLibrary(): EdsdkBindings {
    const libPath = getLibraryPath();
    cameraLogger.info(`Loading EDSDK from: ${libPath}`);

    lib = koffi.load(libPath);

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
            [
                EdsCameraRef,
                "uint32",
                koffi.pointer(EdsPropertyEventHandler),
                VoidPtr,
            ],
        ),
        EdsSetStateEventHandler: lib.func("EdsSetCameraStateEventHandler", "uint32", [
            EdsCameraRef,
            "uint32",
            koffi.pointer(EdsStateEventHandler),
            VoidPtr,
        ]),

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
    EdsSendStatusCommand: (
        camera: any,
        command: number,
        param: number,
    ) => number;
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
        cameraLogger.info("EDSDK library unloaded");
    }
}

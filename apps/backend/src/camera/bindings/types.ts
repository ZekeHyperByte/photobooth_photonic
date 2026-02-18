/**
 * EDSDK FFI Type Definitions
 * Maps C types to Node.js types for ffi-napi
 */

import ref from "ref-napi";

// Basic types
export const EdsVoid = ref.types.void;
export const EdsBool = ref.types.int;
export const EdsChar = ref.types.char;
export const EdsInt8 = ref.types.int8;
export const EdsUInt8 = ref.types.uint8;
export const EdsInt16 = ref.types.int16;
export const EdsUInt16 = ref.types.uint16;
export const EdsInt32 = ref.types.int32;
export const EdsUInt32 = ref.types.uint32;
export const EdsInt64 = ref.types.int64;
export const EdsUInt64 = ref.types.uint64;
export const EdsFloat = ref.types.float;
export const EdsDouble = ref.types.double;
export const EdsError = EdsUInt32;

// Pointer types
export const EdsVoidPtr = ref.refType(EdsVoid);
export const EdsCharPtr = ref.refType(EdsChar);
export const EdsUInt32Ptr = ref.refType(EdsUInt32);
export const EdsInt32Ptr = ref.refType(EdsInt32);

// Reference types (all are pointers to opaque structs)
export const EdsBaseRef = EdsVoidPtr;
export const EdsCameraListRef = EdsBaseRef;
export const EdsCameraRef = EdsBaseRef;
export const EdsVolumeRef = EdsBaseRef;
export const EdsDirectoryItemRef = EdsBaseRef;
export const EdsStreamRef = EdsBaseRef;
export const EdsImageRef = EdsBaseRef;
export const EdsEvfImageRef = EdsBaseRef;

// Callback types
export const EdsProgressCallback = ref.refType(ref.types.void);
export const EdsCameraAddedHandler = ref.refType(ref.types.void);
export const EdsPropertyEventHandler = ref.refType(ref.types.void);
export const EdsObjectEventHandler = ref.refType(ref.types.void);
export const EdsStateEventHandler = ref.refType(ref.types.void);

// Structs (simplified for FFI)
export const EdsDeviceInfo = ref.types.CString; // Simplified
export const EdsVolumeInfo = ref.types.CString; // Simplified
export const EdsDirectoryItemInfo = ref.types.CString; // Simplified
export const EdsImageInfo = ref.types.CString; // Simplified
export const EdsPropertyDesc = ref.types.CString; // Simplified
export const EdsSaveImageSetting = ref.types.CString; // Simplified
export const EdsCapacity = ref.types.CString; // Simplified

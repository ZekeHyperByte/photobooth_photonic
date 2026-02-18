/**
 * EDSDK FFI Function Declarations
 * Maps EDSDK.h functions to ffi-napi format
 */

import * as types from "./types";

/**
 * EDSDK Function Signatures
 * Format: [returnType, [arg1Type, arg2Type, ...]]
 */
export const edsdkFunctions = {
  // ==========================================================================
  // Basic Functions
  // ==========================================================================

  EdsInitializeSDK: [types.EdsError, []],
  EdsTerminateSDK: [types.EdsError, []],

  // ==========================================================================
  // Reference Management
  // ==========================================================================

  EdsRetain: [types.EdsUInt32, [types.EdsBaseRef]],
  EdsRelease: [types.EdsUInt32, [types.EdsBaseRef]],

  // ==========================================================================
  // Item Tree Operations
  // ==========================================================================

  EdsGetChildCount: [types.EdsError, [types.EdsBaseRef, types.EdsUInt32Ptr]],
  EdsGetChildAtIndex: [
    types.EdsError,
    [types.EdsBaseRef, types.EdsInt32, types.EdsBaseRef],
  ],
  EdsGetParent: [types.EdsError, [types.EdsBaseRef, types.EdsBaseRef]],

  // ==========================================================================
  // Property Operations
  // ==========================================================================

  EdsGetPropertySize: [
    types.EdsError,
    [
      types.EdsBaseRef,
      types.EdsUInt32,
      types.EdsInt32,
      types.EdsUInt32Ptr,
      types.EdsUInt32Ptr,
    ],
  ],

  EdsGetPropertyData: [
    types.EdsError,
    [
      types.EdsBaseRef,
      types.EdsUInt32,
      types.EdsInt32,
      types.EdsUInt32,
      types.EdsVoidPtr,
    ],
  ],

  EdsSetPropertyData: [
    types.EdsError,
    [
      types.EdsBaseRef,
      types.EdsUInt32,
      types.EdsInt32,
      types.EdsUInt32,
      types.EdsVoidPtr,
    ],
  ],

  EdsGetPropertyDesc: [
    types.EdsError,
    [
      types.EdsBaseRef,
      types.EdsUInt32,
      types.EdsVoidPtr, // EdsPropertyDesc*
    ],
  ],

  // ==========================================================================
  // Camera Operations
  // ==========================================================================

  EdsGetCameraList: [types.EdsError, [types.EdsBaseRef]],

  EdsGetDeviceInfo: [
    types.EdsError,
    [
      types.EdsCameraRef,
      types.EdsVoidPtr, // EdsDeviceInfo*
    ],
  ],

  EdsOpenSession: [types.EdsError, [types.EdsCameraRef]],
  EdsCloseSession: [types.EdsError, [types.EdsCameraRef]],

  EdsSendCommand: [
    types.EdsError,
    [types.EdsCameraRef, types.EdsUInt32, types.EdsInt32],
  ],

  EdsSendStatusCommand: [
    types.EdsError,
    [types.EdsCameraRef, types.EdsUInt32, types.EdsInt32],
  ],

  EdsSetCapacity: [
    types.EdsError,
    [
      types.EdsCameraRef,
      types.EdsVoidPtr, // EdsCapacity*
    ],
  ],

  // ==========================================================================
  // Volume Operations
  // ==========================================================================

  EdsGetVolumeInfo: [
    types.EdsError,
    [
      types.EdsVolumeRef,
      types.EdsVoidPtr, // EdsVolumeInfo*
    ],
  ],

  EdsFormatVolume: [types.EdsError, [types.EdsVolumeRef]],

  // ==========================================================================
  // Directory Item Operations
  // ==========================================================================

  EdsGetDirectoryItemInfo: [
    types.EdsError,
    [
      types.EdsDirectoryItemRef,
      types.EdsVoidPtr, // EdsDirectoryItemInfo*
    ],
  ],

  EdsDeleteDirectoryItem: [types.EdsError, [types.EdsDirectoryItemRef]],

  EdsDownload: [
    types.EdsError,
    [types.EdsDirectoryItemRef, types.EdsUInt32, types.EdsStreamRef],
  ],

  EdsDownloadCancel: [types.EdsError, [types.EdsDirectoryItemRef]],
  EdsDownloadComplete: [types.EdsError, [types.EdsDirectoryItemRef]],

  EdsDownloadThumbnail: [
    types.EdsError,
    [types.EdsDirectoryItemRef, types.EdsStreamRef],
  ],

  EdsGetAttribute: [
    types.EdsError,
    [types.EdsDirectoryItemRef, types.EdsUInt32Ptr],
  ],

  EdsSetAttribute: [
    types.EdsError,
    [types.EdsDirectoryItemRef, types.EdsUInt32],
  ],

  // ==========================================================================
  // Stream Operations
  // ==========================================================================

  EdsCreateFileStream: [
    types.EdsError,
    [types.EdsCharPtr, types.EdsUInt32, types.EdsUInt32, types.EdsBaseRef],
  ],

  EdsCreateMemoryStream: [types.EdsError, [types.EdsUInt32, types.EdsBaseRef]],

  EdsCreateFileStreamEx: [
    types.EdsError,
    [
      types.EdsVoidPtr, // WCHAR*
      types.EdsUInt32,
      types.EdsUInt32,
      types.EdsBaseRef,
    ],
  ],

  EdsCreateMemoryStreamFromPointer: [
    types.EdsError,
    [types.EdsVoidPtr, types.EdsUInt32, types.EdsBaseRef],
  ],

  EdsGetPointer: [types.EdsError, [types.EdsStreamRef, types.EdsBaseRef]],

  EdsRead: [
    types.EdsError,
    [types.EdsStreamRef, types.EdsUInt32, types.EdsVoidPtr, types.EdsUInt32Ptr],
  ],

  EdsWrite: [
    types.EdsError,
    [types.EdsStreamRef, types.EdsUInt32, types.EdsVoidPtr, types.EdsUInt32Ptr],
  ],

  EdsSeek: [
    types.EdsError,
    [types.EdsStreamRef, types.EdsInt32, types.EdsUInt32],
  ],

  EdsGetPosition: [types.EdsError, [types.EdsStreamRef, types.EdsUInt32Ptr]],

  EdsGetLength: [types.EdsError, [types.EdsStreamRef, types.EdsUInt32Ptr]],

  EdsCopyData: [
    types.EdsError,
    [types.EdsStreamRef, types.EdsUInt32, types.EdsStreamRef],
  ],

  EdsSetProgressCallback: [
    types.EdsError,
    [
      types.EdsBaseRef,
      types.EdsVoidPtr, // EdsProgressCallback
      types.EdsUInt32,
      types.EdsVoidPtr,
    ],
  ],

  // ==========================================================================
  // Image Operations
  // ==========================================================================

  EdsCreateImageRef: [types.EdsError, [types.EdsStreamRef, types.EdsBaseRef]],

  EdsGetImageInfo: [
    types.EdsError,
    [
      types.EdsImageRef,
      types.EdsUInt32,
      types.EdsVoidPtr, // EdsImageInfo*
    ],
  ],

  EdsGetImage: [
    types.EdsError,
    [
      types.EdsImageRef,
      types.EdsUInt32,
      types.EdsUInt32,
      types.EdsVoidPtr, // EdsRect
      types.EdsVoidPtr, // EdsSize
      types.EdsStreamRef,
    ],
  ],

  EdsSaveImage: [
    types.EdsError,
    [
      types.EdsImageRef,
      types.EdsUInt32,
      types.EdsVoidPtr, // EdsSaveImageSetting*
      types.EdsStreamRef,
    ],
  ],

  EdsCacheImage: [types.EdsError, [types.EdsImageRef, types.EdsBool]],

  EdsReflectImageProperty: [types.EdsError, [types.EdsImageRef]],

  // ==========================================================================
  // Live View (EVF) Operations
  // ==========================================================================

  EdsCreateEvfImageRef: [
    types.EdsError,
    [types.EdsStreamRef, types.EdsBaseRef],
  ],

  EdsDownloadEvfImage: [
    types.EdsError,
    [types.EdsCameraRef, types.EdsEvfImageRef],
  ],

  // ==========================================================================
  // Event Handlers
  // ==========================================================================

  EdsSetCameraAddedHandler: [
    types.EdsError,
    [
      types.EdsVoidPtr, // EdsCameraAddedHandler
      types.EdsVoidPtr,
    ],
  ],

  EdsSetPropertyEventHandler: [
    types.EdsError,
    [
      types.EdsBaseRef,
      types.EdsUInt32,
      types.EdsVoidPtr, // EdsPropertyEventHandler
      types.EdsVoidPtr,
    ],
  ],

  EdsSetObjectEventHandler: [
    types.EdsError,
    [
      types.EdsBaseRef,
      types.EdsUInt32,
      types.EdsVoidPtr, // EdsObjectEventHandler
      types.EdsVoidPtr,
    ],
  ],

  EdsSetStateEventHandler: [
    types.EdsError,
    [
      types.EdsBaseRef,
      types.EdsUInt32,
      types.EdsVoidPtr, // EdsStateEventHandler
      types.EdsVoidPtr,
    ],
  ],
};

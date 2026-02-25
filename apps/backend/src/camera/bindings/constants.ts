/**
 * EDSDK Constants & Types
 *
 * Canon EOS Digital SDK property IDs, commands, events, and error codes.
 * Reference: EDSDK.h, EDSDKTypes.h, EDSDKErrors.h
 */

// ============================================================================
// Property IDs
// ============================================================================

export const kEdsPropID_ProductName = 0x00000002;
export const kEdsPropID_BodyIDEx = 0x00000015;
export const kEdsPropID_FirmwareVersion = 0x00000007;
export const kEdsPropID_BatteryLevel = 0x00000008;
export const kEdsPropID_BatteryQuality = 0x00000010;
export const kEdsPropID_AvailableShots = 0x0000003c;

// Image settings
export const kEdsPropID_ImageQuality = 0x00000100;
export const kEdsPropID_ISOSpeed = 0x00000402;
export const kEdsPropID_Av = 0x00000405;
export const kEdsPropID_Tv = 0x00000406;
export const kEdsPropID_ExposureCompensation = 0x00000407;
export const kEdsPropID_WhiteBalance = 0x00000403;
export const kEdsPropID_DriveMode = 0x00000408;
export const kEdsPropID_AEMode = 0x00000400;
export const kEdsPropID_AFMode = 0x00000404;
export const kEdsPropID_MeteringMode = 0x00000409;

// Save target
export const kEdsPropID_SaveTo = 0x0000000b;

// Live View
export const kEdsPropID_Evf_Mode = 0x00000501;
export const kEdsPropID_Evf_OutputDevice = 0x00000502;
export const kEdsPropID_Evf_WhiteBalance = 0x00000503;
export const kEdsPropID_Evf_Zoom = 0x00000507;
export const kEdsPropID_Evf_ZoomPosition = 0x00000508;
export const kEdsPropID_Evf_AFMode = 0x0000050e;

// ============================================================================
// Save target values
// ============================================================================

export const kEdsSaveTo_Camera = 1;
export const kEdsSaveTo_Host = 2;
export const kEdsSaveTo_Both = 3;

// ============================================================================
// EVF Output Device
// ============================================================================

export const kEdsEvfOutputDevice_TFT = 1;
export const kEdsEvfOutputDevice_PC = 2;
export const kEdsEvfOutputDevice_PC_Small = 8;

// ============================================================================
// Camera Commands
// ============================================================================

export const kEdsCameraCommand_TakePicture = 0x00000000;
export const kEdsCameraCommand_ExtendShutDownTimer = 0x00000001;
export const kEdsCameraCommand_BulbStart = 0x00000002;
export const kEdsCameraCommand_BulbEnd = 0x00000003;
export const kEdsCameraCommand_DoEvfAf = 0x00000102;
export const kEdsCameraCommand_DriveLensEvf = 0x00000103;
export const kEdsCameraCommand_DoClickWBEvf = 0x00000104;
export const kEdsCameraCommand_PressShutterButton = 0x00000004;
export const kEdsCameraCommand_SetRemoteShootingMode = 0x0000010f;

// Shutter button states
export const kEdsCameraCommand_ShutterButton_OFF = 0x00000000;
export const kEdsCameraCommand_ShutterButton_Halfway = 0x00000001;
export const kEdsCameraCommand_ShutterButton_Completely = 0x00000003;
export const kEdsCameraCommand_ShutterButton_Completely_NonAF = 0x00010003;

// Status commands
export const kEdsCameraStatusCommand_UILock = 0x00000000;
export const kEdsCameraStatusCommand_UIUnLock = 0x00000001;
export const kEdsCameraStatusCommand_EnterDirectTransfer = 0x00000002;
export const kEdsCameraStatusCommand_ExitDirectTransfer = 0x00000003;

// ============================================================================
// Object Events
// ============================================================================

export const kEdsObjectEvent_All = 0x00000200;
export const kEdsObjectEvent_VolumeInfoChanged = 0x00000201;
export const kEdsObjectEvent_VolumeUpdateItems = 0x00000202;
export const kEdsObjectEvent_FolderUpdateItems = 0x00000203;
export const kEdsObjectEvent_DirItemCreated = 0x00000204;
export const kEdsObjectEvent_DirItemRemoved = 0x00000205;
export const kEdsObjectEvent_DirItemInfoChanged = 0x00000206;
export const kEdsObjectEvent_DirItemContentChanged = 0x00000207;
export const kEdsObjectEvent_DirItemRequestTransfer = 0x00000208;
export const kEdsObjectEvent_DirItemRequestTransferDT = 0x00000209;
export const kEdsObjectEvent_DirItemCancelTransferDT = 0x0000020a;

// Property Events
export const kEdsPropertyEvent_All = 0x00000100;
export const kEdsPropertyEvent_PropertyChanged = 0x00000101;
export const kEdsPropertyEvent_PropertyDescChanged = 0x00000102;

// State Events
export const kEdsStateEvent_All = 0x00000300;
export const kEdsStateEvent_Shutdown = 0x00000301;
export const kEdsStateEvent_JobStatusChanged = 0x00000302;
export const kEdsStateEvent_WillSoonShutDown = 0x00000303;
export const kEdsStateEvent_ShutDownTimerUpdate = 0x00000304;
export const kEdsStateEvent_CaptureError = 0x00000305;

// ============================================================================
// File creation dispositions
// ============================================================================

export const kEdsFileCreateDisposition_CreateNew = 0;
export const kEdsFileCreateDisposition_CreateAlways = 1;
export const kEdsFileCreateDisposition_OpenExisting = 2;
export const kEdsFileCreateDisposition_OpenAlways = 3;
export const kEdsFileCreateDisposition_TruncateExisting = 4;

// ============================================================================
// Access modes
// ============================================================================

export const kEdsAccess_Read = 0;
export const kEdsAccess_Write = 1;
export const kEdsAccess_ReadWrite = 2;

// ============================================================================
// Error codes
// ============================================================================

export const EDS_ERR_OK = 0x00000000;
export const EDS_ERR_UNIMPLEMENTED = 0x00000001;
export const EDS_ERR_INTERNAL_ERROR = 0x00000002;
export const EDS_ERR_MEM_ALLOC_FAILED = 0x00000003;
export const EDS_ERR_MEM_FREE_FAILED = 0x00000004;
export const EDS_ERR_OPERATION_CANCELLED = 0x00000005;
export const EDS_ERR_INCOMPATIBLE_VERSION = 0x00000006;
export const EDS_ERR_NOT_SUPPORTED = 0x00000007;
export const EDS_ERR_UNEXPECTED_EXCEPTION = 0x00000008;
export const EDS_ERR_PROTECTION_VIOLATION = 0x00000009;
export const EDS_ERR_MISSING_SUBCOMPONENT = 0x0000000a;
export const EDS_ERR_SELECTION_UNAVAILABLE = 0x0000000b;

// File errors
export const EDS_ERR_FILE_IO_ERROR = 0x00000020;
export const EDS_ERR_FILE_TOO_MANY_OPEN = 0x00000021;
export const EDS_ERR_FILE_NOT_FOUND = 0x00000022;
export const EDS_ERR_FILE_OPEN_ERROR = 0x00000023;
export const EDS_ERR_FILE_CLOSE_ERROR = 0x00000024;
export const EDS_ERR_FILE_SEEK_ERROR = 0x00000025;
export const EDS_ERR_FILE_TELL_ERROR = 0x00000026;
export const EDS_ERR_FILE_READ_ERROR = 0x00000027;
export const EDS_ERR_FILE_WRITE_ERROR = 0x00000028;
export const EDS_ERR_FILE_PERMISSION_ERROR = 0x00000029;
export const EDS_ERR_FILE_DISK_FULL_ERROR = 0x0000002a;
export const EDS_ERR_FILE_ALREADY_EXISTS = 0x0000002b;
export const EDS_ERR_FILE_FORMAT_UNRECOGNIZED = 0x0000002c;
export const EDS_ERR_FILE_DATA_CORRUPT = 0x0000002d;
export const EDS_ERR_FILE_NAMING_NA = 0x0000002e;

// Device errors
export const EDS_ERR_DEVICE_NOT_FOUND = 0x00000080;
export const EDS_ERR_DEVICE_BUSY = 0x00000081;
export const EDS_ERR_DEVICE_INVALID = 0x00000082;
export const EDS_ERR_DEVICE_EMERGENCY = 0x00000083;
export const EDS_ERR_DEVICE_MEMORY_FULL = 0x00000084;
export const EDS_ERR_DEVICE_INTERNAL_ERROR = 0x00000085;
export const EDS_ERR_DEVICE_INVALID_PARAMETER = 0x00000086;
export const EDS_ERR_DEVICE_NO_DISK = 0x00000087;
export const EDS_ERR_DEVICE_DISK_ERROR = 0x00000088;
export const EDS_ERR_DEVICE_CF_GATE_CHANGED = 0x00000089;
export const EDS_ERR_DEVICE_DIAL_CHANGED = 0x0000008a;
export const EDS_ERR_DEVICE_NOT_INSTALLED = 0x0000008b;
export const EDS_ERR_DEVICE_STAY_AWAKE = 0x0000008c;
export const EDS_ERR_DEVICE_NOT_RELEASED = 0x0000008d;

// Take picture errors
export const EDS_ERR_TAKE_PICTURE_AF_NG = 0x00008d01;
export const EDS_ERR_TAKE_PICTURE_RESERVED = 0x00008d02;
export const EDS_ERR_TAKE_PICTURE_MIRROR_UP_NG = 0x00008d03;
export const EDS_ERR_TAKE_PICTURE_SENSOR_CLEANING_NG = 0x00008d04;
export const EDS_ERR_TAKE_PICTURE_SILENCE_NG = 0x00008d05;
export const EDS_ERR_TAKE_PICTURE_NO_CARD_NG = 0x00008d06;
export const EDS_ERR_TAKE_PICTURE_CARD_NG = 0x00008d07;
export const EDS_ERR_TAKE_PICTURE_CARD_PROTECT_NG = 0x00008d08;

// Session errors
export const EDS_ERR_SESSION_NOT_OPEN = 0x00002003;
export const EDS_ERR_INVALID_TRANSACTIONID = 0x00002004;
export const EDS_ERR_INCOMPLETE_TRANSFER = 0x00002007;
export const EDS_ERR_INVALID_STERAGE_ID = 0x00002008;
export const EDS_ERR_DEVICE_PROP_NOT_SUPPORTED = 0x0000200a;
export const EDS_ERR_INVALID_OBJECTFORMATCODE = 0x0000200b;

// Communication errors
export const EDS_ERR_COMM_USB_BUS_ERR = 0x80008102; // USB communication error - often transient during live view

// ============================================================================
// Helper: error code to string
// ============================================================================

const ERROR_MAP: Record<number, string> = {
  [EDS_ERR_OK]: "OK",
  [EDS_ERR_DEVICE_NOT_FOUND]: "Device not found",
  [EDS_ERR_DEVICE_BUSY]: "Device busy",
  [EDS_ERR_DEVICE_INVALID]: "Device invalid",
  [EDS_ERR_DEVICE_MEMORY_FULL]: "Device memory full",
  [EDS_ERR_DEVICE_INTERNAL_ERROR]: "Device internal error",
  [EDS_ERR_SESSION_NOT_OPEN]: "Session not open",
  [EDS_ERR_TAKE_PICTURE_AF_NG]: "AF failed",
  [EDS_ERR_TAKE_PICTURE_NO_CARD_NG]: "No card",
  [EDS_ERR_TAKE_PICTURE_CARD_NG]: "Card error",
  [EDS_ERR_TAKE_PICTURE_CARD_PROTECT_NG]: "Card write-protected",
  [EDS_ERR_NOT_SUPPORTED]: "Not supported",
  [EDS_ERR_INTERNAL_ERROR]: "Internal error",
  [EDS_ERR_COMM_USB_BUS_ERR]: "USB communication error",
};

export function edsErrorToString(err: number): string {
  return (
    ERROR_MAP[err] || `Unknown error: 0x${err.toString(16).padStart(8, "0")}`
  );
}

export function checkError(err: number, context: string): void {
  if (err !== EDS_ERR_OK) {
    throw new Error(
      `EDSDK ${context}: ${edsErrorToString(err)} (0x${err.toString(16)})`,
    );
  }
}

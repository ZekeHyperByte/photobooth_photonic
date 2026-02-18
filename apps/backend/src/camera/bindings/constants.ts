/**
 * EDSDK Constants
 * Extracted from EDSDK.h and EDSDKTypes.h header files
 */

// ============================================================================
// Error Codes
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
export const EDS_ERR_FUNCTION_NOT_FOUND = 0x0000000c;
export const EDS_ERR_MESSAGE_NOT_CREATED = 0x0000000d;
export const EDS_ERR_STRING_NOT_CREATED = 0x0000000e;
export const EDS_ERR_STRING_TOO_LONG = 0x0000000f;
export const EDS_ERR_INVALID_PARAMETER = 0x00000010;
export const EDS_ERR_INVALID_HANDLE = 0x00000011;
export const EDS_ERR_INVALID_POINTER = 0x00000012;
export const EDS_ERR_INVALID_INDEX = 0x00000013;
export const EDS_ERR_INVALID_LENGTH = 0x00000014;
export const EDS_ERR_INVALID_FN_POINTER = 0x00000015;
export const EDS_ERR_INVALID_SORT_FN = 0x00000016;
export const EDS_ERR_INVALID_DEVICE = 0x00000017;
export const EDS_ERR_DEVICE_NOT_FOUND = 0x0000001a;
export const EDS_ERR_DEVICE_BUSY = 0x0000001b;
export const EDS_ERR_DEVICE_INVALID = 0x0000001c;
export const EDS_ERR_DEVICE_EMERGENCY = 0x0000001d;
export const EDS_ERR_DEVICE_MEMORY_FULL = 0x0000001e;
export const EDS_ERR_DEVICE_INTERNAL_ERROR = 0x0000001f;
export const EDS_ERR_DEVICE_INVALID_PARAMETER = 0x00000020;
export const EDS_ERR_DEVICE_NO_DISK = 0x00000021;
export const EDS_ERR_DEVICE_DISK_ERROR = 0x00000022;
export const EDS_ERR_DEVICE_CF_GATE_CHANGED = 0x00000023;
export const EDS_ERR_DEVICE_DIAL_CHANGED = 0x00000024;
export const EDS_ERR_DEVICE_NOT_INSTALLED = 0x00000025;
export const EDS_ERR_DEVICE_STAY_AWAKE = 0x00000026;
export const EDS_ERR_DEVICE_NOT_RELEASED = 0x00000027;
export const EDS_ERR_DEVICE_WAITING = 0x00000028;
export const EDS_ERR_DEVICE_NOT_LAUNCHED = 0x0000002b;
export const EDS_ERR_DEVICE_NOT_CONNECTED = 0x0000002c;
export const EDS_ERR_DEVICE_VERSION_MISMATCH = 0x0000002d;
export const EDS_ERR_DEVICE_NOT_READY = 0x0000002e;
export const EDS_ERR_DEVICE_ALREADY_REGISTERED = 0x0000002f;

// ============================================================================
// Property IDs
// ============================================================================

export const kEdsPropID_Unknown = 0x0000ffff;
export const kEdsPropID_ProductName = 0x00000002;
export const kEdsPropID_BodyID = 0x00000003;
export const kEdsPropID_OwnerName = 0x00000004;
export const kEdsPropID_MakerName = 0x00000005;
export const kEdsPropID_DateTime = 0x00000006;
export const kEdsPropID_FirmwareVersion = 0x00000007;
export const kEdsPropID_BatteryLevel = 0x00000008;
export const kEdsPropID_CFn = 0x00000009;
export const kEdsPropID_SaveTo = 0x0000000b;
export const kEdsPropID_CurrentStorage = 0x0000000c;
export const kEdsPropID_CurrentFolder = 0x0000000d;
export const kEdsPropID_MyMenu = 0x0000000e;
export const kEdsPropID_BatteryQuality = 0x00000010;
export const kEdsPropID_HDDirectoryStructure = 0x00000020;

// Image Properties
export const kEdsPropID_ImageQuality = 0x00000100;
export const kEdsPropID_JpegQuality = 0x00000101;
export const kEdsPropID_Orientation = 0x00000102;
export const kEdsPropID_ICCProfile = 0x00000103;
export const kEdsPropID_FocusInfo = 0x00000104;
export const kEdsPropID_DigitalExposure = 0x00000105;
export const kEdsPropID_WhiteBalance = 0x00000106;
export const kEdsPropID_ColorTemperature = 0x00000107;
export const kEdsPropID_WhiteBalanceShift = 0x00000108;
export const kEdsPropID_Contrast = 0x00000109;
export const kEdsPropID_ColorSaturation = 0x0000010a;
export const kEdsPropID_ColorTone = 0x0000010b;
export const kEdsPropID_Sharpness = 0x0000010c;
export const kEdsPropID_ColorSpace = 0x0000010d;
export const kEdsPropID_ToneCurve = 0x0000010e;
export const kEdsPropID_PhotoEffect = 0x0000010f;
export const kEdsPropID_FilterEffect = 0x00000110;
export const kEdsPropID_ToningEffect = 0x00000111;
export const kEdsPropID_ParameterSet = 0x00000112;
export const kEdsPropID_ColorMatrix = 0x00000113;
export const kEdsPropID_PictureStyle = 0x00000114;
export const kEdsPropID_PictureStyleDesc = 0x00000115;
export const kEdsPropID_ETTL2Mode = 0x00000117;
export const kEdsPropID_PictureStyleCaption = 0x00000200;

// Capture Properties
export const kEdsPropID_AEMode = 0x00000400;
export const kEdsPropID_DriveMode = 0x00000401;
export const kEdsPropID_ISOSpeed = 0x00000402;
export const kEdsPropID_MeteringMode = 0x00000403;
export const kEdsPropID_AFMode = 0x00000404;
export const kEdsPropID_Av = 0x00000405;
export const kEdsPropID_Tv = 0x00000406;
export const kEdsPropID_ExposureCompensation = 0x00000407;
export const kEdsPropID_FlashCompensation = 0x00000408;
export const kEdsPropID_FocalLength = 0x00000409;
export const kEdsPropID_AvailableShots = 0x0000040a;
export const kEdsPropID_Bracket = 0x0000040b;
export const kEdsPropID_WhiteBalanceBracket = 0x0000040c;
export const kEdsPropID_LensName = 0x0000040d;
export const kEdsPropID_AEBracket = 0x0000040e;
export const kEdsPropID_FEBracket = 0x0000040f;
export const kEdsPropID_ISOBracket = 0x00000410;
export const kEdsPropID_NoiseReduction = 0x00000411;
export const kEdsPropID_FlashOn = 0x00000412;
export const kEdsPropID_RedEye = 0x00000413;
export const kEdsPropID_FlashMode = 0x00000414;
export const kEdsPropID_LensStatus = 0x00000416;
export const kEdsPropID_Artist = 0x00000418;
export const kEdsPropID_Copyright = 0x00000419;
export const kEdsPropID_DepthOfField = 0x0000041b;
export const kEdsPropID_EFCompensation = 0x0000041e;

// EVF Properties
export const kEdsPropID_Evf_OutputDevice = 0x00000500;
export const kEdsPropID_Evf_Mode = 0x00000501;
export const kEdsPropID_Evf_WhiteBalance = 0x00000502;
export const kEdsPropID_Evf_ColorTemperature = 0x00000503;
export const kEdsPropID_Evf_DepthOfFieldPreview = 0x00000504;
export const kEdsPropID_Evf_Zoom = 0x00000507;
export const kEdsPropID_Evf_ZoomPosition = 0x00000508;
export const kEdsPropID_Evf_FocusAid = 0x00000509;
export const kEdsPropID_Evf_Histogram = 0x0000050a;
export const kEdsPropID_Evf_ImagePosition = 0x0000050b;
export const kEdsPropID_Evf_HistogramStatus = 0x0000050c;
export const kEdsPropID_Evf_AFMode = 0x0000050e;

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

// Shutter Button States
export const kEdsCameraCommand_ShutterButton_OFF = 0x00000000;
export const kEdsCameraCommand_ShutterButton_Halfway = 0x00000001;
export const kEdsCameraCommand_ShutterButton_Completely = 0x00000003;
export const kEdsCameraCommand_ShutterButton_Halfway_NonAF = 0x00010001;
export const kEdsCameraCommand_ShutterButton_Completely_NonAF = 0x00010003;

// ============================================================================
// Camera Status Commands
// ============================================================================

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
export const kEdsObjectEvent_VolumeAdded = 0x0000020c;
export const kEdsObjectEvent_VolumeRemoved = 0x0000020d;

// ============================================================================
// Property Events
// ============================================================================

export const kEdsPropertyEvent_All = 0x00000100;
export const kEdsPropertyEvent_PropertyChanged = 0x00000101;
export const kEdsPropertyEvent_PropertyDescChanged = 0x00000102;

// ============================================================================
// State Events
// ============================================================================

export const kEdsStateEvent_All = 0x00000300;
export const kEdsStateEvent_Shutdown = 0x00000301;
export const kEdsStateEvent_JobStatusChanged = 0x00000302;
export const kEdsStateEvent_WillSoonShutDown = 0x00000303;
export const kEdsStateEvent_ShutDownTimerUpdate = 0x00000304;
export const kEdsStateEvent_CaptureError = 0x00000305;
export const kEdsStateEvent_InternalError = 0x00000306;
export const kEdsStateEvent_AfResult = 0x00000309;
export const kEdsStateEvent_BulbExposureTime = 0x00000310;

// ============================================================================
// Save To Options
// ============================================================================

export const kEdsSaveTo_Camera = 1;
export const kEdsSaveTo_Host = 2;
export const kEdsSaveTo_Both = 3;

// ============================================================================
// EVF Output Device
// ============================================================================

export const kEdsEvfOutputDevice_TFT = 1;
export const kEdsEvfOutputDevice_PC = 2;

// ============================================================================
// EVF Zoom
// ============================================================================

export const kEdsEvfZoom_Fit = 1;
export const kEdsEvfZoom_x5 = 5;
export const kEdsEvfZoom_x10 = 10;

// ============================================================================
// White Balance
// ============================================================================

export const kEdsWhiteBalance_Auto = 0;
export const kEdsWhiteBalance_Daylight = 1;
export const kEdsWhiteBalance_Cloudy = 2;
export const kEdsWhiteBalance_Tangsten = 3;
export const kEdsWhiteBalance_Fluorescent = 4;
export const kEdsWhiteBalance_Strobe = 5;
export const kEdsWhiteBalance_WhitePaper = 6;
export const kEdsWhiteBalance_Shade = 8;
export const kEdsWhiteBalance_ColorTemp = 9;

// ============================================================================
// ISO Speed Values
// ============================================================================

export const kEdsISOSpeed_Auto = 0x00000000;
export const kEdsISOSpeed_ISO50 = 0x00000040;
export const kEdsISOSpeed_ISO100 = 0x00000048;
export const kEdsISOSpeed_ISO125 = 0x0000004b;
export const kEdsISOSpeed_ISO160 = 0x0000004d;
export const kEdsISOSpeed_ISO200 = 0x00000050;
export const kEdsISOSpeed_ISO250 = 0x00000053;
export const kEdsISOSpeed_ISO320 = 0x00000055;
export const kEdsISOSpeed_ISO400 = 0x00000058;
export const kEdsISOSpeed_ISO500 = 0x0000005b;
export const kEdsISOSpeed_ISO640 = 0x0000005d;
export const kEdsISOSpeed_ISO800 = 0x00000060;
export const kEdsISOSpeed_ISO1000 = 0x00000063;
export const kEdsISOSpeed_ISO1250 = 0x00000065;
export const kEdsISOSpeed_ISO1600 = 0x00000068;
export const kEdsISOSpeed_ISO2000 = 0x0000006b;
export const kEdsISOSpeed_ISO2500 = 0x0000006d;
export const kEdsISOSpeed_ISO3200 = 0x00000070;
export const kEdsISOSpeed_ISO4000 = 0x00000073;
export const kEdsISOSpeed_ISO5000 = 0x00000075;
export const kEdsISOSpeed_ISO6400 = 0x00000078;
export const kEdsISOSpeed_ISO12800 = 0x00000080;
export const kEdsISOSpeed_ISO25600 = 0x00000088;

// ============================================================================
// File Create Disposition
// ============================================================================

export const kEdsFileCreateDisposition_CreateNew = 0;
export const kEdsFileCreateDisposition_CreateAlways = 1;
export const kEdsFileCreateDisposition_OpenExisting = 2;
export const kEdsFileCreateDisposition_OpenAlways = 3;
export const kEdsFileCreateDisposition_TruncateExisting = 4;

// ============================================================================
// Access Modes
// ============================================================================

export const kEdsAccess_Read = 0;
export const kEdsAccess_Write = 1;
export const kEdsAccess_ReadWrite = 2;
export const kEdsAccess_Error = 0xffffffff;

// ============================================================================
// Seek Origins
// ============================================================================

export const kEdsSeek_Cur = 0;
export const kEdsSeek_Begin = 1;
export const kEdsSeek_End = 2;

// ============================================================================
// Data Types
// ============================================================================

export const kEdsDataType_Unknown = 0;
export const kEdsDataType_Bool = 1;
export const kEdsDataType_String = 2;
export const kEdsDataType_Int8 = 3;
export const kEdsDataType_Int16 = 4;
export const kEdsDataType_UInt8 = 6;
export const kEdsDataType_UInt16 = 7;
export const kEdsDataType_Int32 = 8;
export const kEdsDataType_UInt32 = 9;
export const kEdsDataType_Int64 = 10;
export const kEdsDataType_UInt64 = 11;
export const kEdsDataType_Float = 12;
export const kEdsDataType_Double = 13;
export const kEdsDataType_ByteBlock = 14;
export const kEdsDataType_Rational = 20;
export const kEdsDataType_Point = 21;
export const kEdsDataType_Rect = 22;
export const kEdsDataType_Time = 23;

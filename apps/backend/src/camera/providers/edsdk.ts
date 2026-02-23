/**
 * EDSDK Camera Provider
 *
 * Camera provider that talks directly to Canon cameras via EDSDK.
 * Replaces the gPhoto2 Python camera-service bridge with native calls.
 *
 * Supports both Linux (libEDSDK.so) and Windows (EDSDK.dll).
 */

import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import {
    CameraProvider,
    CaptureResult,
    ExtendedCameraStatusResponse,
} from "../types";
import { CameraError, CameraNotInitializedError } from "../errors";
import { cameraLogger } from "../logger";
import { env } from "../../config/env";
import {
    EdsdkBindings,
    loadEdsdkLibrary,
    unloadEdsdkLibrary,
} from "../bindings/edsdk-bindings";
import * as C from "../bindings/constants";

export class EdsdkProvider implements CameraProvider {
    private sdk: EdsdkBindings | null = null;
    private cameraRef: any = null;
    private cameraListRef: any = null;
    private cameraModel = "Unknown";
    private isSessionOpen = false;
    private liveViewActive = false;
    private eventPollTimer: ReturnType<typeof setInterval> | null = null;

    // Capture state
    private pendingCapture: {
        resolve: (filePath: string) => void;
        reject: (error: Error) => void;
        outputPath: string;
    } | null = null;

    async initialize(): Promise<void> {
        cameraLogger.info("EdsdkProvider: Initializing EDSDK camera provider");

        try {
            // Load EDSDK library
            this.sdk = loadEdsdkLibrary();

            // Initialize SDK
            const err = this.sdk.EdsInitializeSDK();
            C.checkError(err, "EdsInitializeSDK");
            cameraLogger.info("EdsdkProvider: SDK initialized");

            // Get camera list
            const cameraListOut = [null];
            C.checkError(
                this.sdk.EdsGetCameraList(cameraListOut),
                "EdsGetCameraList",
            );
            this.cameraListRef = cameraListOut[0];

            // Get camera count
            const countOut = [0];
            C.checkError(
                this.sdk.EdsGetChildCount(this.cameraListRef, countOut),
                "EdsGetChildCount",
            );
            const cameraCount = countOut[0];

            if (cameraCount === 0) {
                throw new CameraError("No Canon cameras detected", {
                    operation: "initialize",
                    timestamp: new Date().toISOString(),
                });
            }

            cameraLogger.info(`EdsdkProvider: Found ${cameraCount} camera(s)`);

            // Get first camera
            const cameraOut = [null];
            C.checkError(
                this.sdk.EdsGetChildAtIndex(this.cameraListRef, 0, cameraOut),
                "EdsGetChildAtIndex",
            );
            this.cameraRef = cameraOut[0];

            // Get device info
            const deviceInfo = {};
            C.checkError(
                this.sdk.EdsGetDeviceInfo(this.cameraRef, deviceInfo),
                "EdsGetDeviceInfo",
            );
            this.cameraModel =
                (deviceInfo as any).szDeviceDescription || "Canon Camera";
            cameraLogger.info(`EdsdkProvider: Camera model: ${this.cameraModel}`);

            // Open session
            C.checkError(this.sdk.EdsOpenSession(this.cameraRef), "EdsOpenSession");
            this.isSessionOpen = true;
            cameraLogger.info("EdsdkProvider: Session opened");

            // Set save target to host computer
            const saveTo = Buffer.alloc(4);
            saveTo.writeUInt32LE(C.kEdsSaveTo_Host);
            C.checkError(
                this.sdk.EdsSetPropertyData(
                    this.cameraRef,
                    C.kEdsPropID_SaveTo,
                    0,
                    4,
                    saveTo,
                ),
                "SetSaveTo",
            );

            // Set host capacity (tell camera we have space)
            const capacity = {
                numberOfFreeClusters: 0x7fffffff,
                bytesPerSector: 0x1000,
                reset: 1,
            };
            C.checkError(
                this.sdk.EdsSetCapacity(this.cameraRef, capacity),
                "EdsSetCapacity",
            );

            // Register object event handler for capture downloads
            this.setupEventHandlers();

            // Start event polling (required on Linux/console)
            this.startEventPolling();

            cameraLogger.info(
                "EdsdkProvider: EDSDK provider initialized successfully",
                {
                    model: this.cameraModel,
                },
            );
        } catch (error) {
            cameraLogger.error("EdsdkProvider: Failed to initialize", { error });
            this.cleanup();
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        cameraLogger.info("EdsdkProvider: Disconnecting camera");
        this.cleanup();
        cameraLogger.info("EdsdkProvider: Camera disconnected");
    }

    isConnected(): boolean {
        return this.isSessionOpen && this.cameraRef !== null;
    }

    // ===========================================================================
    // Capture
    // ===========================================================================

    async capturePhoto(
        sessionId: string,
        sequenceNumber: number,
    ): Promise<CaptureResult> {
        if (!this.isConnected() || !this.sdk) {
            throw new CameraNotInitializedError("capturePhoto");
        }

        cameraLogger.info("EdsdkProvider: Capturing photo", {
            sessionId,
            sequenceNumber,
        });

        // Stop live view if active
        if (this.liveViewActive) {
            await this.stopLiveView();
        }

        // Prepare output path
        const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
        const outputDir = env.tempPhotoPath;
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }
        const outputPath = path.join(outputDir, filename);

        try {
            // Take picture using shutter button press (no AF)
            const imagePath = await this.takePictureAndDownload(outputPath);

            cameraLogger.info("EdsdkProvider: Photo captured successfully", {
                sessionId,
                sequenceNumber,
                imagePath,
                size: fs.existsSync(imagePath) ? fs.statSync(imagePath).size : 0,
            });

            // Get metadata from camera properties
            const metadata = await this.getCaptureMetadata();

            return {
                imagePath,
                metadata: {
                    model: this.cameraModel,
                    timestamp: new Date().toISOString(),
                    ...metadata,
                },
            };
        } catch (error) {
            cameraLogger.error("EdsdkProvider: Capture failed", {
                sessionId,
                sequenceNumber,
                error,
            });
            throw error;
        }
    }

    private takePictureAndDownload(outputPath: string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            if (!this.sdk) {
                reject(new Error("SDK not initialized"));
                return;
            }

            // Set up capture callback state
            this.pendingCapture = { resolve, reject, outputPath };

            // Send shutter button press without AF
            const err = this.sdk.EdsSendCommand(
                this.cameraRef,
                C.kEdsCameraCommand_PressShutterButton,
                C.kEdsCameraCommand_ShutterButton_Completely_NonAF,
            );

            if (err !== C.EDS_ERR_OK) {
                this.pendingCapture = null;
                reject(
                    new Error(
                        `Shutter press failed: ${C.edsErrorToString(err)} (0x${err.toString(16)})`,
                    ),
                );
                return;
            }

            // Release shutter button
            this.sdk.EdsSendCommand(
                this.cameraRef,
                C.kEdsCameraCommand_PressShutterButton,
                C.kEdsCameraCommand_ShutterButton_OFF,
            );

            // Timeout after 15 seconds
            setTimeout(() => {
                if (this.pendingCapture) {
                    this.pendingCapture = null;
                    reject(new Error("Capture timed out after 15 seconds"));
                }
            }, 15000);
        });
    }

    // ===========================================================================
    // Live View
    // ===========================================================================

    async startLiveView(): Promise<void> {
        if (!this.isConnected() || !this.sdk) {
            throw new CameraNotInitializedError("startLiveView");
        }

        if (this.liveViewActive) {
            return;
        }

        cameraLogger.info("EdsdkProvider: Starting live view");

        // Enable EVF mode
        const evfMode = Buffer.alloc(4);
        evfMode.writeUInt32LE(1);
        this.sdk.EdsSetPropertyData(
            this.cameraRef,
            C.kEdsPropID_Evf_Mode,
            0,
            4,
            evfMode,
        );

        // Set output device to PC
        const outputDevice = Buffer.alloc(4);
        outputDevice.writeUInt32LE(C.kEdsEvfOutputDevice_PC);
        C.checkError(
            this.sdk.EdsSetPropertyData(
                this.cameraRef,
                C.kEdsPropID_Evf_OutputDevice,
                0,
                4,
                outputDevice,
            ),
            "SetEvfOutputDevice",
        );

        this.liveViewActive = true;
        cameraLogger.info("EdsdkProvider: Live view started");
    }

    async stopLiveView(): Promise<void> {
        if (!this.liveViewActive || !this.sdk) {
            return;
        }

        cameraLogger.info("EdsdkProvider: Stopping live view");

        // Set output device back to TFT (camera LCD)
        const outputDevice = Buffer.alloc(4);
        outputDevice.writeUInt32LE(C.kEdsEvfOutputDevice_TFT);
        this.sdk.EdsSetPropertyData(
            this.cameraRef,
            C.kEdsPropID_Evf_OutputDevice,
            0,
            4,
            outputDevice,
        );

        this.liveViewActive = false;
        cameraLogger.info("EdsdkProvider: Live view stopped");
    }

    async getLiveViewFrame(): Promise<Buffer> {
        if (!this.liveViewActive || !this.sdk) {
            throw new CameraError("Live view not started", {
                operation: "getLiveViewFrame",
                timestamp: new Date().toISOString(),
            });
        }

        // Create memory stream for EVF image
        const streamOut = [null];
        let err = this.sdk.EdsCreateMemoryStream(BigInt(0), streamOut);
        if (err !== C.EDS_ERR_OK) {
            throw new CameraError(`Failed to create memory stream: ${C.edsErrorToString(err)}`, {
                operation: "getLiveViewFrame",
                timestamp: new Date().toISOString(),
            });
        }
        const stream = streamOut[0];

        try {
            // Create EVF image ref
            const evfOut = [null];
            err = this.sdk.EdsCreateEvfImageRef(stream, evfOut);
            if (err !== C.EDS_ERR_OK) {
                throw new CameraError(`Failed to create EVF ref: ${C.edsErrorToString(err)}`, {
                    operation: "getLiveViewFrame",
                    timestamp: new Date().toISOString(),
                });
            }
            const evfImage = evfOut[0];

            try {
                // Download EVF image
                err = this.sdk.EdsDownloadEvfImage(this.cameraRef, evfImage);
                if (err === 0x00000041) {
                    // EDS_ERR_OBJECT_NOTREADY — camera not ready yet
                    return Buffer.alloc(0);
                }
                if (err !== C.EDS_ERR_OK) {
                    throw new CameraError(`Failed to download EVF: ${C.edsErrorToString(err)}`, {
                        operation: "getLiveViewFrame",
                        timestamp: new Date().toISOString(),
                    });
                }

                // Get stream data
                const lengthOut = [BigInt(0)];
                this.sdk.EdsGetLength(stream, lengthOut);
                const length = Number(lengthOut[0]);

                if (length === 0) {
                    return Buffer.alloc(0);
                }

                const pointerOut = [null];
                this.sdk.EdsGetPointer(stream, pointerOut);

                // Copy data from native memory to Node.js Buffer
                const buffer = Buffer.from(
                    (pointerOut[0] as any) as ArrayBuffer,
                    0,
                    length,
                );
                return Buffer.from(buffer); // Make a copy before releasing
            } finally {
                this.sdk.EdsRelease(evfImage);
            }
        } finally {
            this.sdk.EdsRelease(stream);
        }
    }

    // ===========================================================================
    // Properties
    // ===========================================================================

    async setProperty(propertyId: number, value: any): Promise<void> {
        if (!this.isConnected() || !this.sdk) {
            throw new CameraNotInitializedError("setProperty");
        }

        const data = Buffer.alloc(4);
        if (typeof value === "number") {
            data.writeUInt32LE(value);
        } else {
            data.writeUInt32LE(Number(value));
        }

        const err = this.sdk.EdsSetPropertyData(
            this.cameraRef,
            propertyId,
            0,
            4,
            data,
        );

        if (err !== C.EDS_ERR_OK) {
            cameraLogger.warn(
                `EdsdkProvider: Failed to set property 0x${propertyId.toString(16)}: ${C.edsErrorToString(err)}`,
            );
        } else {
            cameraLogger.debug(
                `EdsdkProvider: Property 0x${propertyId.toString(16)} set to ${value}`,
            );
        }
    }

    async getProperty(propertyId: number): Promise<any> {
        if (!this.isConnected() || !this.sdk) {
            throw new CameraNotInitializedError("getProperty");
        }

        const data = Buffer.alloc(4);
        const err = this.sdk.EdsGetPropertyData(
            this.cameraRef,
            propertyId,
            0,
            4,
            data,
        );

        if (err !== C.EDS_ERR_OK) {
            cameraLogger.warn(
                `EdsdkProvider: Failed to get property 0x${propertyId.toString(16)}: ${C.edsErrorToString(err)}`,
            );
            return null;
        }

        return data.readUInt32LE();
    }

    // ===========================================================================
    // Status
    // ===========================================================================

    async getStatus(): Promise<ExtendedCameraStatusResponse> {
        if (!this.isConnected()) {
            return {
                connected: false,
                model: "No camera detected",
                battery: 0,
                storageAvailable: false,
                settings: {},
            };
        }

        try {
            const battery = (await this.getProperty(C.kEdsPropID_BatteryLevel)) ?? 100;
            const iso = await this.getProperty(C.kEdsPropID_ISOSpeed);
            const av = await this.getProperty(C.kEdsPropID_Av);
            const tv = await this.getProperty(C.kEdsPropID_Tv);
            const wb = await this.getProperty(C.kEdsPropID_WhiteBalance);

            return {
                connected: true,
                model: this.cameraModel,
                battery: typeof battery === "number" ? battery : 100,
                storageAvailable: true,
                settings: {
                    iso: iso ? String(iso) : "Auto",
                    aperture: av ? `f/${av}` : "Auto",
                    shutterSpeed: tv ? String(tv) : "Auto",
                    whiteBalance: wb ? String(wb) : "Auto",
                },
                providerMetadata: {
                    provider: "edsdk",
                    liveViewActive: this.liveViewActive,
                },
            };
        } catch (error) {
            cameraLogger.error("EdsdkProvider: Failed to get status", { error });
            throw error;
        }
    }

    async extendShutDownTimer(): Promise<void> {
        if (!this.isConnected() || !this.sdk) {
            return;
        }

        this.sdk.EdsSendCommand(
            this.cameraRef,
            C.kEdsCameraCommand_ExtendShutDownTimer,
            0,
        );
    }

    async triggerFocus(): Promise<void> {
        if (!this.isConnected() || !this.sdk) {
            throw new CameraNotInitializedError("triggerFocus");
        }

        // Half-press shutter for AF
        this.sdk.EdsSendCommand(
            this.cameraRef,
            C.kEdsCameraCommand_PressShutterButton,
            C.kEdsCameraCommand_ShutterButton_Halfway,
        );

        // Wait for AF
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Release
        this.sdk.EdsSendCommand(
            this.cameraRef,
            C.kEdsCameraCommand_PressShutterButton,
            C.kEdsCameraCommand_ShutterButton_OFF,
        );
    }

    // ===========================================================================
    // Private helpers
    // ===========================================================================

    private setupEventHandlers(): void {
        if (!this.sdk || !this.cameraRef) return;

        // Object event handler - for capture file downloads
        const objectHandler = (event: number, ref: any, _context: any): number => {
            if (
                event === C.kEdsObjectEvent_DirItemRequestTransfer &&
                this.pendingCapture
            ) {
                this.handleCaptureDownload(ref);
            }
            return C.EDS_ERR_OK;
        };

        this.sdk.EdsSetObjectEventHandler(
            this.cameraRef,
            C.kEdsObjectEvent_All,
            objectHandler as any,
            null,
        );

        // State event handler
        const stateHandler = (event: number, param: number, _context: any): number => {
            if (event === C.kEdsStateEvent_Shutdown) {
                cameraLogger.warn("EdsdkProvider: Camera requesting shutdown");
            } else if (event === C.kEdsStateEvent_WillSoonShutDown) {
                // Extend timer to keep camera awake
                this.extendShutDownTimer();
            }
            return C.EDS_ERR_OK;
        };

        this.sdk.EdsSetStateEventHandler(
            this.cameraRef,
            C.kEdsStateEvent_All,
            stateHandler as any,
            null,
        );

        cameraLogger.info("EdsdkProvider: Event handlers registered");
    }

    private handleCaptureDownload(directoryItem: any): void {
        if (!this.sdk || !this.pendingCapture) return;

        const { resolve, reject, outputPath } = this.pendingCapture;
        this.pendingCapture = null;

        try {
            // Get directory item info
            const itemInfo = {};
            C.checkError(
                this.sdk.EdsGetDirectoryItemInfo(directoryItem, itemInfo),
                "EdsGetDirectoryItemInfo",
            );

            const fileSize = (itemInfo as any).size || 0;
            cameraLogger.info(
                `EdsdkProvider: Downloading captured image (${fileSize} bytes)`,
            );

            // Create file stream for download
            const streamOut = [null];
            C.checkError(
                this.sdk.EdsCreateFileStream(
                    outputPath,
                    C.kEdsFileCreateDisposition_CreateAlways,
                    C.kEdsAccess_ReadWrite,
                    streamOut,
                ),
                "EdsCreateFileStream",
            );
            const stream = streamOut[0];

            try {
                // Download image
                C.checkError(
                    this.sdk.EdsDownload(directoryItem, BigInt(fileSize), stream),
                    "EdsDownload",
                );

                // Signal download complete
                C.checkError(
                    this.sdk.EdsDownloadComplete(directoryItem),
                    "EdsDownloadComplete",
                );

                cameraLogger.info(`EdsdkProvider: Image downloaded to ${outputPath}`);
                resolve(outputPath);
            } finally {
                this.sdk.EdsRelease(stream);
            }
        } catch (error) {
            cameraLogger.error("EdsdkProvider: Download failed", { error });
            reject(error as Error);
        }
    }

    private startEventPolling(): void {
        // Poll EdsGetEvent every 50ms to process SDK events
        // This is required on Linux and console applications
        this.eventPollTimer = setInterval(() => {
            if (this.sdk) {
                try {
                    this.sdk.EdsGetEvent();
                } catch {
                    // Ignore polling errors
                }
            }
        }, 50);
    }

    private async getCaptureMetadata(): Promise<Record<string, string>> {
        try {
            const iso = await this.getProperty(C.kEdsPropID_ISOSpeed);
            const av = await this.getProperty(C.kEdsPropID_Av);
            const tv = await this.getProperty(C.kEdsPropID_Tv);

            return {
                iso: iso ? String(iso) : "Auto",
                aperture: av ? `f/${av}` : "Auto",
                shutterSpeed: tv ? String(tv) : "Auto",
                focalLength: "Unknown",
            };
        } catch {
            return {
                iso: "Auto",
                shutterSpeed: "1/125",
                aperture: "f/5.6",
                focalLength: "Unknown",
            };
        }
    }

    private cleanup(): void {
        // Stop event polling
        if (this.eventPollTimer) {
            clearInterval(this.eventPollTimer);
            this.eventPollTimer = null;
        }

        // Stop live view
        if (this.liveViewActive && this.sdk) {
            try {
                const outputDevice = Buffer.alloc(4);
                outputDevice.writeUInt32LE(C.kEdsEvfOutputDevice_TFT);
                this.sdk.EdsSetPropertyData(
                    this.cameraRef,
                    C.kEdsPropID_Evf_OutputDevice,
                    0,
                    4,
                    outputDevice,
                );
            } catch {
                // Ignore
            }
            this.liveViewActive = false;
        }

        // Close session
        if (this.isSessionOpen && this.sdk && this.cameraRef) {
            try {
                this.sdk.EdsCloseSession(this.cameraRef);
            } catch {
                // Ignore
            }
            this.isSessionOpen = false;
        }

        // Release camera ref
        if (this.cameraRef && this.sdk) {
            try {
                this.sdk.EdsRelease(this.cameraRef);
            } catch {
                // Ignore
            }
            this.cameraRef = null;
        }

        // Release camera list
        if (this.cameraListRef && this.sdk) {
            try {
                this.sdk.EdsRelease(this.cameraListRef);
            } catch {
                // Ignore
            }
            this.cameraListRef = null;
        }

        // Terminate SDK
        if (this.sdk) {
            try {
                this.sdk.EdsTerminateSDK();
            } catch {
                // Ignore
            }
            this.sdk = null;
        }

        unloadEdsdkLibrary();
    }
}

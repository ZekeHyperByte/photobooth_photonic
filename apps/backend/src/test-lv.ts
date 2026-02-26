import { loadEdsdkLibrary, getLoadedSdkInfo } from "./camera/bindings/edsdk-bindings";
import * as C from "./camera/bindings/constants";
import { CameraEventPump } from "./camera/event-pump";
import { setTimeout } from "timers/promises";
import fs from "fs";

async function testLiveView() {
    console.log("Loading SDK...");
    const sdk = loadEdsdkLibrary();
    const info = getLoadedSdkInfo();
    console.log(`SDK loaded: ${info.version}`);

    const err = sdk.EdsInitializeSDK();
    if (err !== C.EDS_ERR_OK) {
        console.error(`Initialize failed: ${err.toString(16)}`);
        return;
    }

    const cameraListOut = [null];
    sdk.EdsGetCameraList(cameraListOut);
    const cameraListRef = cameraListOut[0];

    const countOut = [0];
    sdk.EdsGetChildCount(cameraListRef, countOut);
    if (countOut[0] === 0) {
        console.error("No cameras found");
        return;
    }

    const cameraOut = [null];
    sdk.EdsGetChildAtIndex(cameraListRef, 0, cameraOut);
    const cameraRef = cameraOut[0];

    const sessionErr = sdk.EdsOpenSession(cameraRef);
    if (sessionErr !== C.EDS_ERR_OK) {
        console.error(`Open session failed: ${sessionErr.toString(16)}`);
        return;
    }
    console.log("Session opened");

    const saveTo = Buffer.alloc(4);
    saveTo.writeUInt32LE(C.kEdsSaveTo_Host);
    sdk.EdsSetPropertyData(cameraRef, C.kEdsPropID_SaveTo, 0, 4, saveTo);

    const capacity = {
        numberOfFreeClusters: 0x7fffffff,
        bytesPerSector: 0x1000,
        reset: 1,
    };
    sdk.EdsSetCapacity(cameraRef, capacity);

    const pump = new CameraEventPump(60);
    pump.start(sdk);

    console.log("Waking up camera...");
    sdk.EdsSendCommand(cameraRef, C.kEdsCameraCommand_PressShutterButton, C.kEdsCameraCommand_ShutterButton_Halfway);
    await setTimeout(500);
    sdk.EdsSendCommand(cameraRef, C.kEdsCameraCommand_PressShutterButton, C.kEdsCameraCommand_ShutterButton_OFF);

    // Wait before trying live view
    await setTimeout(1000);

    const setEvfMode = (mode: number) => {
        const data = Buffer.alloc(4);
        data.writeUInt32LE(mode);
        return sdk.EdsSetPropertyData(cameraRef, C.kEdsPropID_Evf_Mode, 0, 4, data);
    };

    const setOutputDevice = (device: number) => {
        const data = Buffer.alloc(4);
        data.writeUInt32LE(device);
        return sdk.EdsSetPropertyData(cameraRef, C.kEdsPropID_Evf_OutputDevice, 0, 4, data);
    };

    const testFrame = () => {
        const streamOut = [null];
        let e = sdk.EdsCreateMemoryStream(BigInt(0), streamOut);
        if (e !== C.EDS_ERR_OK) return e;
        const stream = streamOut[0];

        const evfOut = [null];
        e = sdk.EdsCreateEvfImageRef(stream, evfOut);
        if (e !== C.EDS_ERR_OK) {
            sdk.EdsRelease(stream);
            return e;
        }
        const evfImage = evfOut[0];

        e = sdk.EdsDownloadEvfImage(cameraRef, evfImage);

        sdk.EdsRelease(evfImage);
        sdk.EdsRelease(stream);
        return e;
    };

    console.log("\n--- TEST SEQUENCE 1 (Original EDSDK Way: Mode -> PC) ---");
    console.log(`Setting EVF Mode 1... err: ${setEvfMode(1).toString(16)}`);
    await setTimeout(1500);
    console.log(`Setting Output Device PC... err: ${setOutputDevice(C.kEdsEvfOutputDevice_PC).toString(16)}`);
    await setTimeout(1500);
    console.log(`Test frame result: ${testFrame().toString(16)}`);

    console.log("\nResetting...");
    setOutputDevice(C.kEdsEvfOutputDevice_TFT);
    await setTimeout(1000);
    setEvfMode(0);
    await setTimeout(3000);

    console.log("Waking up camera again...");
    sdk.EdsSendCommand(cameraRef, C.kEdsCameraCommand_PressShutterButton, C.kEdsCameraCommand_ShutterButton_Halfway);
    await setTimeout(500);
    sdk.EdsSendCommand(cameraRef, C.kEdsCameraCommand_PressShutterButton, C.kEdsCameraCommand_ShutterButton_OFF);
    await setTimeout(1000);

    console.log("\n--- TEST SEQUENCE 2 (Reversed Way: PC -> Mode) ---");
    console.log(`Setting Output Device PC... err: ${setOutputDevice(C.kEdsEvfOutputDevice_PC).toString(16)}`);
    await setTimeout(1500);
    console.log(`Setting EVF Mode 1... err: ${setEvfMode(1).toString(16)}`);
    await setTimeout(1500);
    console.log(`Test frame result: ${testFrame().toString(16)}`);

    console.log("\nResetting...");
    setOutputDevice(C.kEdsEvfOutputDevice_TFT);
    await setTimeout(1000);
    setEvfMode(0);
    await setTimeout(3000);

    pump.stop();
    sdk.EdsCloseSession(cameraRef);
    sdk.EdsTerminateSDK();
    console.log("Done");
}

testLiveView().catch(console.error);

/**
 * USB Reset Utility
 *
 * Provides aggressive USB reset capabilities for camera recovery
 * Includes process cleanup, USB bus reset, and retry logic
 */

import { exec, spawn } from "child_process";
import { promisify } from "util";
import { cameraLogger } from "./logger";
import * as fs from "fs";
import * as path from "path";

const execAsync = promisify(exec);

export interface USBResetResult {
  success: boolean;
  message: string;
  details?: any;
}

export interface CameraUSBInfo {
  busNumber: string;
  deviceNumber: string;
  vendorId: string;
  productId: string;
  devicePath: string;
}

/**
 * Kill all gphoto2 and camera-related processes
 */
export async function resetGphoto2Processes(): Promise<USBResetResult> {
  cameraLogger.info("USBReset: Killing gphoto2 processes");

  const processesToKill = ["gphoto2", "PTPCamera", "canon"];

  const results: string[] = [];

  for (const proc of processesToKill) {
    try {
      // Try pkill first (Linux)
      const { stdout, stderr } = await execAsync(
        `pkill -9 -f "${proc}" 2>/dev/null || true`,
      );
      results.push(`Killed ${proc}: ${stdout || "success"}`);
    } catch (error) {
      // Process might not exist, that's ok
      results.push(`No ${proc} processes found`);
    }
  }

  cameraLogger.debug("USBReset: Process cleanup complete", { results });

  return {
    success: true,
    message: "Process cleanup complete",
    details: results,
  };
}

/**
 * Find Canon camera USB device information
 */
export async function findCanonCamera(): Promise<CameraUSBInfo | null> {
  try {
    // Use lsusb to find Canon cameras (Canon vendor ID is 04a9)
    const { stdout } = await execAsync(
      "lsusb | grep -i canon || lsusb | grep 04a9",
    );

    if (!stdout.trim()) {
      cameraLogger.warn("USBReset: No Canon camera found in lsusb");
      return null;
    }

    // Parse lsusb output: Bus 001 Device 007: ID 04a9:31ea Canon, Inc. EOS 550D
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      const match = line.match(
        /Bus\s+(\d+)\s+Device\s+(\d+).*ID\s+([0-9a-fA-F]+):([0-9a-fA-F]+)/i,
      );
      if (match) {
        const [, busNumber, deviceNumber, vendorId, productId] = match;
        const devicePath = `/dev/bus/usb/${busNumber.padStart(3, "0")}/${deviceNumber.padStart(3, "0")}`;

        cameraLogger.info("USBReset: Found Canon camera", {
          busNumber,
          deviceNumber,
          vendorId,
          productId,
          devicePath,
        });

        return {
          busNumber,
          deviceNumber,
          vendorId: vendorId.toLowerCase(),
          productId: productId.toLowerCase(),
          devicePath,
        };
      }
    }

    return null;
  } catch (error) {
    cameraLogger.error("USBReset: Failed to find Canon camera", { error });
    return null;
  }
}

/**
 * Reset USB device using usbreset tool
 * This requires usbreset to be installed or available
 */
export async function resetUSBBus(
  cameraInfo: CameraUSBInfo,
): Promise<USBResetResult> {
  cameraLogger.info("USBReset: Resetting USB device", {
    devicePath: cameraInfo.devicePath,
  });

  try {
    // Check if device exists
    if (!fs.existsSync(cameraInfo.devicePath)) {
      return {
        success: false,
        message: `USB device path does not exist: ${cameraInfo.devicePath}`,
      };
    }

    // Try using usbreset if available
    try {
      await execAsync(`which usbreset`);
      const { stdout } = await execAsync(
        `sudo usbreset ${cameraInfo.devicePath}`,
      );
      cameraLogger.info("USBReset: usbreset completed", { output: stdout });

      return {
        success: true,
        message: "USB device reset using usbreset",
        details: { output: stdout },
      };
    } catch {
      cameraLogger.debug(
        "USBReset: usbreset not available, trying alternative methods",
      );
    }

    // Alternative: Use libusb via Node.js or bind/unbind
    // Try unbinding and rebinding the USB driver
    const usbBusPath = `/sys/bus/usb/devices/${cameraInfo.busNumber}-${cameraInfo.deviceNumber}`;

    if (fs.existsSync(usbBusPath)) {
      try {
        // Get the driver name
        const driverPath = path.join(usbBusPath, "driver");
        if (fs.existsSync(driverPath)) {
          const driverName = fs.readlinkSync(driverPath);
          cameraLogger.debug("USBReset: Found USB driver", { driverName });

          // Unbind and rebind
          const unbindPath = `/sys/bus/usb/drivers/${path.basename(driverName)}/unbind`;
          const bindPath = `/sys/bus/usb/drivers/${path.basename(driverName)}/bind`;

          if (fs.existsSync(unbindPath) && fs.existsSync(bindPath)) {
            const deviceId = `${cameraInfo.busNumber}-${cameraInfo.deviceNumber}`;

            cameraLogger.info("USBReset: Unbinding USB device", { deviceId });
            fs.writeFileSync(unbindPath, deviceId);

            await sleep(500);

            cameraLogger.info("USBReset: Rebinding USB device", { deviceId });
            fs.writeFileSync(bindPath, deviceId);

            await sleep(1000);

            return {
              success: true,
              message: "USB device reset using driver unbind/rebind",
            };
          }
        }
      } catch (error) {
        cameraLogger.warn("USBReset: Failed to unbind/rebind USB driver", {
          error,
        });
      }
    }

    // Fallback: Just wait and hope
    cameraLogger.warn(
      "USBReset: No reset method available, waiting for natural recovery",
    );
    await sleep(2000);

    return {
      success: true,
      message: "Waited for natural USB recovery (no reset method available)",
    };
  } catch (error) {
    cameraLogger.error("USBReset: Failed to reset USB device", { error });
    return {
      success: false,
      message: `USB reset failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Comprehensive reset sequence for camera recovery
 */
export async function performCameraReset(): Promise<USBResetResult> {
  cameraLogger.info("USBReset: Starting comprehensive camera reset sequence");

  const steps: string[] = [];

  // Step 1: Kill all camera processes
  try {
    const processResult = await resetGphoto2Processes();
    steps.push(`Process cleanup: ${processResult.success ? "OK" : "FAILED"}`);
    await sleep(500);
  } catch (error) {
    steps.push(`Process cleanup: ERROR - ${error}`);
  }

  // Step 2: Find camera USB device
  let cameraInfo: CameraUSBInfo | null = null;
  try {
    cameraInfo = await findCanonCamera();
    if (cameraInfo) {
      steps.push(
        `Found camera: Bus ${cameraInfo.busNumber} Device ${cameraInfo.deviceNumber}`,
      );
    } else {
      steps.push(`Camera not found in USB list`);
    }
  } catch (error) {
    steps.push(`Find camera: ERROR - ${error}`);
  }

  // Step 3: Reset USB if camera found
  if (cameraInfo) {
    try {
      const usbResult = await resetUSBBus(cameraInfo);
      steps.push(
        `USB reset: ${usbResult.success ? "OK" : "FAILED"} - ${usbResult.message}`,
      );
      await sleep(1000);
    } catch (error) {
      steps.push(`USB reset: ERROR - ${error}`);
    }
  }

  // Step 4: Final wait for camera to settle
  cameraLogger.info("USBReset: Waiting for camera to settle...");
  await sleep(3000);
  steps.push("Wait for settle: OK (3s)");

  const success = steps.every(
    (s) => !s.includes("FAILED") && !s.includes("ERROR"),
  );

  cameraLogger.info("USBReset: Reset sequence complete", { success, steps });

  return {
    success,
    message: success
      ? "Camera reset complete"
      : "Camera reset completed with warnings",
    details: steps,
  };
}

/**
 * Check if camera is accessible via gphoto2
 */
export async function isCameraAccessible(): Promise<boolean> {
  try {
    const { stdout } = await execAsync("gphoto2 --auto-detect", {
      timeout: 5000,
    });
    return stdout.includes("usb:");
  } catch {
    return false;
  }
}

/**
 * Wait for camera to become available after reset
 */
export async function waitForCamera(
  maxWaitMs: number = 30000,
  checkIntervalMs: number = 1000,
): Promise<boolean> {
  const startTime = Date.now();

  cameraLogger.info("USBReset: Waiting for camera to become available", {
    maxWaitMs,
    checkIntervalMs,
  });

  while (Date.now() - startTime < maxWaitMs) {
    if (await isCameraAccessible()) {
      const elapsed = Date.now() - startTime;
      cameraLogger.info(`USBReset: Camera available after ${elapsed}ms`);
      return true;
    }

    await sleep(checkIntervalMs);
  }

  cameraLogger.warn(`USBReset: Camera not available after ${maxWaitMs}ms`);
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Install usbreset tool if not present
 * This creates a small C program to reset USB devices
 */
export async function installUSBReset(): Promise<USBResetResult> {
  try {
    // Check if already installed
    try {
      await execAsync("which usbreset");
      return {
        success: true,
        message: "usbreset already installed",
      };
    } catch {
      // Not installed, continue
    }

    // Create usbreset.c
    const usbresetCode = `
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <fcntl.h>
#include <errno.h>
#include <sys/ioctl.h>
#include <linux/usbdevice_fs.h>

int main(int argc, char **argv) {
    const char *filename;
    int fd;
    int rc;

    if (argc != 2) {
        fprintf(stderr, "Usage: usbreset <device-filename>\\n");
        return 1;
    }

    filename = argv[1];

    fd = open(filename, O_WRONLY);
    if (fd < 0) {
        perror("Error opening output file");
        return 1;
    }

    printf("Resetting USB device %s\\n", filename);
    rc = ioctl(fd, USBDEVFS_RESET, 0);
    if (rc < 0) {
        perror("Error in ioctl");
        return 1;
    }
    printf("Reset successful\\n");

    close(fd);
    return 0;
}
`;

    const tempDir = "/tmp/photonic-usbreset";
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const sourcePath = path.join(tempDir, "usbreset.c");
    fs.writeFileSync(sourcePath, usbresetCode);

    // Compile
    const { stdout, stderr } = await execAsync(
      `cd ${tempDir} && gcc -o usbreset usbreset.c`,
    );

    // Move to system path (requires sudo)
    await execAsync(`sudo cp ${tempDir}/usbreset /usr/local/bin/`);
    await execAsync(`sudo chmod +s /usr/local/bin/usbreset`);

    return {
      success: true,
      message: "usbreset installed successfully to /usr/local/bin/usbreset",
      details: { compileOutput: stdout, compileError: stderr },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to install usbreset: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

import { createLogger } from "@photonic/utils";
import {
  CameraMetadata,
  CameraSettings,
  CameraStatusResponse,
} from "@photonic/types";
import { env } from "../config/env";
import path from "path";
import fs from "fs";
import { promises as fsPromises } from "fs";
import { nanoid } from "nanoid";
import { spawn, exec } from "child_process";
import { promisify } from "util";
import sharp from "sharp";

const execAsync = promisify(exec);
const logger = createLogger("camera-service");

const initializedDirs = new Set<string>();

async function ensureDir(dirPath: string): Promise<void> {
  if (initializedDirs.has(dirPath)) {
    return;
  }
  await fsPromises.mkdir(dirPath, { recursive: true });
  initializedDirs.add(dirPath);
}

export class CameraService {
  private isInitialized = false;
  private cameraMode: "dslr" | "webcam" | "mock" = "mock";
  private webcamDevice: string = "/dev/video0";
  private _isStreaming = false;
  private previewProcess: any = null;
  private ffmpegProcess: any = null;
  private cameraModel: string = "Unknown";

  constructor() {
    if (env.useWebcam) {
      this.cameraMode = "webcam";
      logger.info("Camera service running in WEBCAM MODE");
    } else if (!env.mockCamera) {
      this.cameraMode = "dslr";
      logger.info("Camera service running in DSLR MODE (CLI-based)");
    }

    if (env.mockCamera && this.cameraMode !== "webcam") {
      this.cameraMode = "mock";
      logger.warn("Camera service running in MOCK MODE");
    }

    logger.info(`Camera mode: ${this.cameraMode}`);
  }

  async initialize(): Promise<void> {
    if (this.cameraMode === "mock") {
      this.isInitialized = true;
      logger.info("Mock camera initialized");
      return;
    }

    if (this.cameraMode === "webcam") {
      this.isInitialized = true;
      logger.info("Webcam initialized");
      return;
    }

    return this.detectCamera();
  }

  private async detectCamera(): Promise<void> {
    try {
      const { stdout } = await execAsync("gphoto2 --auto-detect");
      if (stdout.includes("Canon") || stdout.includes("Canon EOS")) {
        // Extract camera model
        const lines = stdout.split("\n");
        for (const line of lines) {
          if (line.includes("usb:")) {
            const parts = line.trim().split("usb:");
            if (parts.length > 0) {
              this.cameraModel = parts[0].trim();
              break;
            }
          }
        }
        this.isInitialized = true;
        logger.info(`Canon camera detected: ${this.cameraModel}`);
      } else if (stdout.trim() === "" || stdout.includes("No cameras")) {
        throw new Error("No camera detected via gphoto2");
      } else {
        this.isInitialized = true;
        logger.info("Camera detected via gphoto2");
      }
    } catch (error: any) {
      logger.error("Failed to detect camera:", error.message);
      throw new Error(`Camera detection failed: ${error.message}`);
    }
  }

  isConnected(): boolean {
    return this.isInitialized;
  }

  get isStreaming(): boolean {
    return this._isStreaming;
  }

  setStreaming(value: boolean): void {
    this._isStreaming = value;
  }

  /**
   * Start preview stream using gphoto2 --capture-movie piped to ffmpeg
   * Returns a readable stream of MJPEG data
   */
  async startPreviewStream(): Promise<NodeJS.ReadableStream> {
    if (this.cameraMode !== "dslr") {
      throw new Error("Preview stream only available in DSLR mode");
    }

    // Kill any existing preview process
    await this.stopPreviewStream();

    logger.info("Starting CLI preview stream...");

    return new Promise((resolve, reject) => {
      try {
        // Spawn gphoto2 to capture movie
        this.previewProcess = spawn(
          "gphoto2",
          ["--capture-movie", "--stdout"],
          {
            stdio: ["ignore", "pipe", "pipe"],
          },
        );

        // Spawn ffmpeg to convert to MJPEG
        this.ffmpegProcess = spawn(
          "ffmpeg",
          [
            "-i",
            "-", // Input from stdin
            "-f",
            "mjpeg", // Output format: MJPEG
            "-q:v",
            "5", // Quality (1-31, lower is better)
            "-r",
            "5", // Frame rate: 5fps
            "pipe:1", // Output to stdout
          ],
          {
            stdio: ["pipe", "pipe", "pipe"],
          },
        );

        // Pipe gphoto2 stdout to ffmpeg stdin
        this.previewProcess.stdout.pipe(this.ffmpegProcess.stdin);

        // Handle errors
        this.previewProcess.on("error", (err: Error) => {
          logger.error("gphoto2 preview process error:", err.message);
          this.cleanupPreviewProcesses();
          reject(err);
        });

        this.ffmpegProcess.on("error", (err: Error) => {
          logger.error("ffmpeg process error:", err.message);
          this.cleanupPreviewProcesses();
          reject(err);
        });

        this.previewProcess.stderr.on("data", (data: Buffer) => {
          const msg = data.toString().trim();
          if (msg && !msg.includes("Sending data") && !msg.includes("blocks")) {
            logger.debug("gphoto2:", msg);
          }
        });

        this.ffmpegProcess.stderr.on("data", (data: Buffer) => {
          const msg = data.toString().trim();
          // ffmpeg outputs progress to stderr, only log errors
          if (msg && msg.includes("Error")) {
            logger.error("ffmpeg:", msg);
          }
        });

        // Wait a moment for processes to start
        setTimeout(() => {
          if (this.ffmpegProcess && this.ffmpegProcess.stdout) {
            this._isStreaming = true;
            logger.info("CLI preview stream started successfully");
            resolve(this.ffmpegProcess.stdout);
          } else {
            reject(new Error("Failed to start preview stream"));
          }
        }, 1000);
      } catch (error: any) {
        logger.error("Failed to start preview stream:", error.message);
        this.cleanupPreviewProcesses();
        reject(error);
      }
    });
  }

  /**
   * Stop the preview stream processes
   */
  async stopPreviewStream(): Promise<void> {
    if (!this.previewProcess && !this.ffmpegProcess) {
      return;
    }

    logger.info("Stopping CLI preview stream...");
    this._isStreaming = false;

    this.cleanupPreviewProcesses();

    // Wait a moment for processes to fully terminate
    await new Promise((resolve) => setTimeout(resolve, 500));

    logger.info("Preview stream stopped");
  }

  private cleanupPreviewProcesses(): void {
    if (this.previewProcess) {
      try {
        this.previewProcess.kill("SIGTERM");
        // Force kill after 2 seconds if still running
        setTimeout(() => {
          try {
            this.previewProcess?.kill("SIGKILL");
          } catch {}
        }, 2000);
      } catch {}
      this.previewProcess = null;
    }

    if (this.ffmpegProcess) {
      try {
        this.ffmpegProcess.kill("SIGTERM");
        setTimeout(() => {
          try {
            this.ffmpegProcess?.kill("SIGKILL");
          } catch {}
        }, 2000);
      } catch {}
      this.ffmpegProcess = null;
    }
  }

  async getPreviewFrame(): Promise<Buffer> {
    throw new Error(
      "getPreviewFrame() not supported in CLI mode. Use startPreviewStream() instead.",
    );
  }

  async capturePhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    if (!this.isInitialized) {
      throw new Error("Camera not initialized");
    }

    if (this.cameraMode === "webcam") {
      return this.captureWebcamPhoto(sessionId, sequenceNumber);
    }

    if (this.cameraMode === "mock") {
      return this.captureMockPhoto(sessionId, sequenceNumber);
    }

    return this.captureDslrPhoto(sessionId, sequenceNumber);
  }

  private async captureDslrPhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    // Stop preview if running (USB exclusivity)
    const wasStreaming = this._isStreaming;
    if (wasStreaming) {
      logger.info("Stopping preview for capture (USB exclusivity)...");
      await this.stopPreviewStream();
      // Wait for camera to settle
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const MAX_RETRIES = 3;
    const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
    const imagePath = path.join(env.tempPhotoPath, filename);

    await ensureDir(env.tempPhotoPath);

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.info(`CLI capture attempt ${attempt}/${MAX_RETRIES}...`, {
          sessionId,
          sequenceNumber,
        });

        // Capture and download in one command
        const command = `gphoto2 --capture-image-and-download --filename "${imagePath}" --force-overwrite`;

        await execAsync(command, { timeout: 15000 });

        // Verify file was created
        if (!fs.existsSync(imagePath)) {
          throw new Error("Capture failed: image file not created");
        }

        const stats = fs.statSync(imagePath);
        if (stats.size < 10000) {
          throw new Error("Capture failed: image file too small");
        }

        logger.info("CLI capture successful", { imagePath, size: stats.size });

        // Restart preview if it was running
        if (wasStreaming) {
          logger.info("Restarting preview stream after capture...");
          // Preview will be restarted by preview-stream-manager
        }

        const metadata: CameraMetadata = {
          model: this.cameraModel,
          iso: "Auto",
          shutterSpeed: "Auto",
          aperture: "Auto",
          focalLength: "Unknown",
          timestamp: new Date().toISOString(),
        };

        return { imagePath, metadata };
      } catch (err: any) {
        const isPtpBusy =
          err?.message?.includes("Device Busy") ||
          err?.message?.includes("-110");

        if (isPtpBusy && attempt < MAX_RETRIES) {
          const delay = 1000 * attempt;
          logger.warn(
            `Capture attempt ${attempt}/${MAX_RETRIES} failed (PTP Device Busy), retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          // Restart preview if it was running (even on error)
          if (wasStreaming) {
            logger.info("Restarting preview stream after capture error...");
          }
          throw err;
        }
      }
    }

    throw new Error("Capture failed: exhausted retries");
  }

  private async captureMockPhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    logger.info("Mock: Capturing photo...", { sessionId, sequenceNumber });

    await new Promise((resolve) => setTimeout(resolve, 1000));

    const mockImageData = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
      0x3f, 0x00, 0x37, 0xff, 0xd9,
    ]);

    const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
    const imagePath = path.join(env.tempPhotoPath, filename);

    await ensureDir(env.tempPhotoPath);
    await fsPromises.writeFile(imagePath, mockImageData);

    logger.info("Mock: Photo captured successfully", { imagePath });

    const metadata: CameraMetadata = {
      model: "Canon EOS Mock Camera",
      iso: "200",
      shutterSpeed: "1/125",
      aperture: "f/2.8",
      focalLength: "50mm",
      timestamp: new Date().toISOString(),
    };

    return { imagePath, metadata };
  }

  private async captureWebcamPhoto(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    logger.info("Webcam: Capturing photo...", { sessionId, sequenceNumber });

    const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
    const imagePath = path.join(env.tempPhotoPath, filename);

    await ensureDir(env.tempPhotoPath);

    try {
      const command = `ffmpeg -f v4l2 -video_size 1280x720 -i ${this.webcamDevice} -frames:v 1 -update 1 -y "${imagePath}"`;

      logger.info("Webcam: Running ffmpeg command");
      await execAsync(command, { timeout: 10000 });

      if (!fs.existsSync(imagePath)) {
        throw new Error("Image file was not created");
      }

      logger.info("Webcam: Photo captured successfully", { imagePath });

      const metadata: CameraMetadata = {
        model: "Development Webcam",
        iso: "N/A",
        shutterSpeed: "N/A",
        aperture: "N/A",
        focalLength: "N/A",
        timestamp: new Date().toISOString(),
      };

      return { imagePath, metadata };
    } catch (error: any) {
      logger.error("Webcam capture failed:", error);
      throw new Error(`Webcam capture failed: ${error.message || error}`);
    }
  }

  async getStatus(): Promise<CameraStatusResponse> {
    if (!this.isInitialized) {
      return {
        connected: false,
        model: "No camera detected",
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }

    if (this.cameraMode === "webcam") {
      return {
        connected: true,
        model: "Development Webcam",
        battery: 100,
        storageAvailable: true,
        settings: {
          iso: "N/A",
          shutterSpeed: "N/A",
          aperture: "N/A",
          whiteBalance: "auto",
          imageFormat: "JPEG",
        },
      };
    }

    if (this.cameraMode === "mock") {
      return {
        connected: true,
        model: "Canon EOS Mock Camera",
        battery: 100,
        storageAvailable: true,
        settings: {
          iso: "200",
          shutterSpeed: "1/125",
          aperture: "f/2.8",
          whiteBalance: "auto",
          imageFormat: "JPEG",
        },
      };
    }

    return {
      connected: true,
      model: this.cameraModel || "Canon DSLR",
      battery: 100,
      storageAvailable: true,
      settings: {
        iso: "Auto",
        shutterSpeed: "Auto",
        aperture: "Auto",
        whiteBalance: "auto",
        imageFormat: "JPEG",
      },
    };
  }

  async configure(settings: Partial<CameraSettings>): Promise<CameraSettings> {
    if (!this.isInitialized) {
      throw new Error("Camera not initialized");
    }

    logger.info("Configuring camera:", settings);

    if (this.cameraMode === "mock" || this.cameraMode === "webcam") {
      return {
        iso: settings.iso || "200",
        shutterSpeed: settings.shutterSpeed || "1/125",
        aperture: settings.aperture || "f/2.8",
        whiteBalance: settings.whiteBalance || "auto",
        imageFormat: settings.imageFormat || "JPEG",
      };
    }

    // CLI mode: Configuration not fully implemented
    logger.warn("Camera configuration not fully implemented for CLI mode");

    return {
      iso: "Auto",
      shutterSpeed: "Auto",
      aperture: "Auto",
      whiteBalance: "auto",
      imageFormat: "JPEG",
    };
  }

  async disconnect(): Promise<void> {
    await this.stopPreviewStream();
    this.isInitialized = false;
    logger.info("Camera disconnected");
  }
}

let cameraService: CameraService | null = null;

export function getCameraService(): CameraService {
  if (!cameraService) {
    cameraService = new CameraService();
  }
  return cameraService;
}

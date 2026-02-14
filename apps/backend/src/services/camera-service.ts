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
import { exec } from "child_process";
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
  private camera: any = null;
  private gphoto2: any = null;
  private isInitialized = false;
  private cameraMode: "dslr" | "webcam" | "mock" = "mock";
  private webcamDevice: string = "/dev/video0";
  private _isStreaming = false;
  private liveViewConfigName: string | null = null;
  private availableConfigs: string[] = [];

  constructor() {
    if (env.useWebcam) {
      this.cameraMode = "webcam";
      logger.info("Camera service running in WEBCAM MODE");
    } else if (!env.mockCamera) {
      try {
        const GPhoto = require("gphoto2");
        this.gphoto2 = new GPhoto.GPhoto2();
        this.cameraMode = "dslr";
        logger.info("Camera service running in DSLR MODE (gphoto2)");
      } catch (error) {
        logger.warn("gphoto2 not available. Running in mock mode.", error);
        env.mockCamera = true;
      }
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

    return this.initializeGphoto2();
  }

  private initializeGphoto2(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.gphoto2.list((cameras: any[]) => {
        if (cameras.length === 0) {
          reject(new Error("No cameras detected"));
          return;
        }

        this.camera = cameras[0];
        this.isInitialized = true;

        logger.info("gphoto2 camera connected:", {
          model: this.camera.model,
          port: this.camera.port,
        });

        resolve();
      });
    });
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
   * Detect available camera configs and identify the correct LiveView config name
   */
  private async detectLiveViewConfig(): Promise<string | null> {
    if (!this.camera) return null;

    try {
      const configs = await new Promise<string[]>((resolve) => {
        this.camera.listConfig((err: any, configs: string[]) => {
          if (err) {
            logger.warn("Failed to list camera configs:", err);
            resolve([]);
          } else {
            resolve(configs || []);
          }
        });
      });

      this.availableConfigs = configs;
      logger.info("Available camera configs:", configs.length);

      // Check for LiveView-related configs in order of preference
      const liveViewConfigs = ["viewfinder", "eosviewfinder"];
      for (const config of liveViewConfigs) {
        if (
          configs.some((c) => c.toLowerCase().includes(config.toLowerCase()))
        ) {
          logger.info(`Detected LiveView config: ${config}`);
          return config;
        }
      }

      logger.warn("No known LiveView config found in camera");
      return null;
    } catch (error) {
      logger.warn("Error detecting LiveView config:", error);
      return null;
    }
  }

  /**
   * Set LiveView config value using the detected config name
   */
  private async setLiveViewValue(value: number): Promise<boolean> {
    if (this.cameraMode !== "dslr" || !this.camera) return false;

    // Detect config name if not already done
    if (!this.liveViewConfigName) {
      this.liveViewConfigName = await this.detectLiveViewConfig();
    }

    if (!this.liveViewConfigName) {
      logger.warn("No LiveView config available on this camera model");
      return false;
    }

    return new Promise((resolve) => {
      this.camera.setConfigValue(this.liveViewConfigName, value, (err: any) => {
        if (err) {
          logger.warn(
            `Failed to set ${this.liveViewConfigName}=${value}:`,
            err.message,
          );
          resolve(false);
        } else {
          logger.info(
            `LiveView ${value === 1 ? "entered" : "exited"} (${this.liveViewConfigName})`,
          );
          resolve(true);
        }
      });
    });
  }

  /**
   * Try to get preview using gphoto2 CLI as fallback
   */
  private async getPreviewViaCLI(): Promise<Buffer> {
    const tempFile = path.join(env.tempPhotoPath, `preview-${nanoid()}.jpg`);

    try {
      logger.info("Attempting preview via gphoto2 CLI...");
      await execAsync(
        `gphoto2 --capture-preview --filename "${tempFile}" --force-overwrite`,
        {
          timeout: 10000,
        },
      );

      if (!fs.existsSync(tempFile)) {
        throw new Error("CLI preview file was not created");
      }

      const data = await fsPromises.readFile(tempFile);
      await fsPromises.unlink(tempFile).catch(() => {}); // Clean up

      if (data.length < 100 || data[0] !== 0xff || data[1] !== 0xd8) {
        throw new Error("CLI preview returned invalid image");
      }

      logger.info(`CLI preview successful (${data.length} bytes)`);
      return data;
    } catch (error: any) {
      // Clean up temp file on error
      try {
        await fsPromises.unlink(tempFile);
      } catch {}
      throw new Error(`CLI preview failed: ${error.message}`);
    }
  }

  /**
   * Explicitly enter LiveView/viewfinder mode on Canon DSLRs.
   * Must be called before preview frames will return data.
   */
  async enterLiveView(): Promise<void> {
    if (this.cameraMode !== "dslr" || !this.camera) return;

    logger.info("Entering LiveView...");
    const success = await this.setLiveViewValue(1);

    if (!success) {
      logger.warn(
        "Could not enter LiveView via config. Will try implicit mode via takePicture.",
      );
    }
  }

  /**
   * Explicitly exit LiveView/viewfinder mode on Canon DSLRs.
   * Must be called before capture if preview was streaming.
   */
  async exitLiveView(): Promise<void> {
    if (this.cameraMode !== "dslr" || !this.camera) return;

    logger.info("Exiting LiveView...");
    await this.setLiveViewValue(0);
  }

  async getPreviewFrame(): Promise<Buffer> {
    if (!this.isInitialized) {
      throw new Error("Camera not initialized");
    }

    if (this.cameraMode === "webcam") {
      throw new Error(
        "Webcam mode uses browser getUserMedia, not server preview",
      );
    }

    if (this.cameraMode === "mock") {
      return this.getMockPreviewFrame();
    }

    return this.getDslrPreviewFrame();
  }

  private async getDslrPreviewFrame(): Promise<Buffer> {
    // Try Node.js wrapper first
    try {
      const frame = await this.getDslrPreviewFrameViaWrapper();
      return frame;
    } catch (wrapperError: any) {
      logger.warn(
        `Node.js wrapper preview failed: ${wrapperError.message}. Trying CLI fallback...`,
      );

      // Fallback to CLI command
      try {
        const frame = await this.getPreviewViaCLI();
        return frame;
      } catch (cliError: any) {
        logger.error(`CLI preview also failed: ${cliError.message}`);
        throw new Error(
          `Preview failed: wrapper error (${wrapperError.message}), CLI error (${cliError.message})`,
        );
      }
    }
  }

  private getDslrPreviewFrameViaWrapper(): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Preview frame timed out (8s)"));
      }, 8000);

      this.camera.takePicture({ preview: true }, (err: any, data: Buffer) => {
        clearTimeout(timeout);
        if (err) {
          reject(new Error(`Preview frame failed: ${err?.message || err}`));
          return;
        }
        if (!data || data.length === 0) {
          reject(new Error("Preview frame returned empty data"));
          return;
        }
        // Validate JPEG header (must start with 0xFFD8)
        if (data.length < 2 || data[0] !== 0xff || data[1] !== 0xd8) {
          reject(new Error("Preview frame has invalid JPEG header"));
          return;
        }
        resolve(data);
      });
    });
  }

  private async getMockPreviewFrame(): Promise<Buffer> {
    const timestamp = new Date().toISOString().slice(11, 23);
    const svg = `
      <svg width="640" height="480" xmlns="http://www.w3.org/2000/svg">
        <rect width="640" height="480" fill="#333"/>
        <text x="320" y="220" text-anchor="middle" fill="#aaa" font-size="28" font-family="monospace">Mock Camera Preview</text>
        <text x="320" y="270" text-anchor="middle" fill="#888" font-size="20" font-family="monospace">${timestamp}</text>
      </svg>`;
    return sharp(Buffer.from(svg))
      .resize(640, 480)
      .jpeg({ quality: 70 })
      .toBuffer();
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

    return this.captureGphoto2WithRetry(sessionId, sequenceNumber);
  }

  private async captureGphoto2WithRetry(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    const MAX_RETRIES = 5;
    const INITIAL_DELAY_MS = 1500;

    // Ensure LiveView is fully exited before capture
    await this.exitLiveView();
    // Canon needs more time to settle after exiting LiveView
    await new Promise((resolve) => setTimeout(resolve, 2500));

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.captureGphoto2(sessionId, sequenceNumber);
      } catch (err: any) {
        const isPtpBusy =
          err?.message?.includes("Device Busy") ||
          err?.message?.includes("-110");
        if (isPtpBusy && attempt < MAX_RETRIES) {
          const delay = INITIAL_DELAY_MS * attempt;
          logger.warn(
            `Capture attempt ${attempt}/${MAX_RETRIES} failed (PTP Device Busy), retrying in ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw err;
        }
      }
    }

    throw new Error("Capture failed: exhausted retries");
  }

  private captureGphoto2(
    sessionId: string,
    sequenceNumber: number,
  ): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    return new Promise((resolve, reject) => {
      logger.info("gphoto2: Capturing photo...", { sessionId, sequenceNumber });

      this.camera.takePicture({ download: true }, (err: any, data: Buffer) => {
        if (err) {
          logger.error(`gphoto2 capture failed: ${err?.message || err}`);
          reject(new Error(`Capture failed: ${err?.message || err}`));
          return;
        }

        try {
          const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
          const imagePath = path.join(env.tempPhotoPath, filename);

          if (!fs.existsSync(env.tempPhotoPath)) {
            fs.mkdirSync(env.tempPhotoPath, { recursive: true });
            initializedDirs.add(env.tempPhotoPath);
          }

          fs.writeFileSync(imagePath, data);

          logger.info("gphoto2: Photo captured successfully", { imagePath });

          const metadata: CameraMetadata = {
            model: this.camera.model || "Unknown",
            iso: "Auto",
            shutterSpeed: "Auto",
            aperture: "Auto",
            focalLength: "Unknown",
            timestamp: new Date().toISOString(),
          };

          resolve({ imagePath, metadata });
        } catch (error: any) {
          logger.error(`Failed to save photo: ${error.message}`);
          reject(new Error(`Failed to save photo: ${error.message}`));
        }
      });
    });
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
      model: this.camera?.model || "Canon DSLR",
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

    // TODO: Implement gphoto2 camera configuration
    logger.warn("Camera configuration not fully implemented for gphoto2");

    return {
      iso: "Auto",
      shutterSpeed: "Auto",
      aperture: "Auto",
      whiteBalance: "auto",
      imageFormat: "JPEG",
    };
  }

  async disconnect(): Promise<void> {
    if (this.camera) {
      this.camera = null;
    }
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

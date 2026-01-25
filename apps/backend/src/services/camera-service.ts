import { createLogger } from '@photonic/utils';
import { CameraMetadata, CameraSettings, CameraStatusResponse } from '@photonic/types';
import { env } from '../config/env';
import path from 'path';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import { nanoid } from 'nanoid';
import { exec } from 'child_process';
import { promisify } from 'util';
import os from 'os';
import { DigiCamControlClient } from './digicam-control-client';

const execAsync = promisify(exec);
const logger = createLogger('camera-service');

// Directory initialization cache to avoid repeated mkdir calls
const initializedDirs = new Set<string>();

/**
 * Ensure directory exists (cached async version)
 * Only calls mkdir once per directory path during app lifetime
 */
async function ensureDir(dirPath: string): Promise<void> {
  if (initializedDirs.has(dirPath)) {
    return;
  }
  await fsPromises.mkdir(dirPath, { recursive: true });
  initializedDirs.add(dirPath);
}

// Detect platform
const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';

export class CameraService {
  private camera: any = null;
  private gphoto2: any = null;
  private digiCamControlClient: DigiCamControlClient | null = null;
  private isInitialized = false;
  private cameraMode: 'dslr-cli' | 'dslr-webserver' | 'webcam' | 'mock' = 'mock';
  private webcamDevice: string = '/dev/video0';
  private digiCamControlPath: string = 'C:\\Program Files\\digiCamControl';

  constructor() {
    // Check for digiCamControl path from env
    if (process.env.DIGICAMCONTROL_PATH) {
      this.digiCamControlPath = process.env.DIGICAMCONTROL_PATH;
    }

    // Priority: Webcam (explicit) > DSLR Webserver > DSLR CLI > Mock
    if (env.useWebcam) {
      this.cameraMode = 'webcam';
      logger.info('Camera service running in WEBCAM MODE');
    } else if (!env.mockCamera) {
      if (isWindows) {
        // Windows: Check for webserver mode first, then CLI mode
        if (env.digiCamControl.webserverEnabled) {
          this.cameraMode = 'dslr-webserver';
          this.digiCamControlClient = new DigiCamControlClient();
          logger.info('Camera service running in DSLR WEBSERVER MODE (digiCamControl)');
        } else {
          const cmdPath = path.join(this.digiCamControlPath, 'CameraControlCmd.exe');
          if (fs.existsSync(cmdPath)) {
            this.cameraMode = 'dslr-cli';
            logger.info('Camera service running in DSLR CLI MODE (digiCamControl)');
          } else {
            logger.warn(
              `digiCamControl not found at ${cmdPath}. Running in mock mode.\n` +
              `Please install digiCamControl from https://digicamcontrol.com/\n` +
              `If installed to a custom location, set DIGICAMCONTROL_PATH in .env file`
            );
            env.mockCamera = true;
          }
        }
      } else if (isLinux) {
        // Linux: Use gphoto2
        try {
          const GPhoto = require('gphoto2');
          this.gphoto2 = new GPhoto.GPhoto2();
          this.cameraMode = 'dslr-cli';
          logger.info('Camera service running in DSLR MODE (gphoto2)');
        } catch (error) {
          logger.warn('gphoto2 not available. Running in mock mode.', error);
          env.mockCamera = true;
        }
      }
    }

    if (env.mockCamera && this.cameraMode !== 'webcam') {
      this.cameraMode = 'mock';
      logger.warn('Camera service running in MOCK MODE');
    }

    logger.info(`Platform: ${os.platform()}, Camera mode: ${this.cameraMode}`);
  }

  /**
   * Initialize camera connection
   */
  async initialize(): Promise<void> {
    if (this.cameraMode === 'mock') {
      this.isInitialized = true;
      logger.info('Mock camera initialized');
      return;
    }

    if (this.cameraMode === 'webcam') {
      this.isInitialized = true;
      logger.info('Webcam initialized');
      return;
    }

    if (this.cameraMode === 'dslr-webserver') {
      return this.initializeDigiCamControlWebserver();
    }

    if (isWindows) {
      // Windows: Test digiCamControl CLI connection
      return this.initializeDigiCamControl();
    } else {
      // Linux: Use gphoto2
      return this.initializeGphoto2();
    }
  }

  /**
   * Initialize digiCamControl (Windows)
   */
  private async initializeDigiCamControl(): Promise<void> {
    try {
      const cmdPath = path.join(this.digiCamControlPath, 'CameraControlCmd.exe');
      const { stdout } = await execAsync(`"${cmdPath}" /list`, { timeout: 10000 });

      if (stdout.toLowerCase().includes('no camera')) {
        throw new Error(
          'Canon 550D not detected. Please check:\n' +
          '  1. Camera is powered ON\n' +
          '  2. USB cable is connected properly\n' +
          '  3. Camera mode is set to Manual (M)\n' +
          '  4. No other camera software is running (Canon EOS Utility, etc.)\n' +
          '  5. Camera auto-off is disabled in camera menu'
        );
      }

      this.isInitialized = true;
      logger.info('digiCamControl initialized', { output: stdout.trim() });
    } catch (error: any) {
      if (error.message.includes('Canon 550D not detected')) {
        logger.error('Camera not detected by digiCamControl');
        throw error;
      }

      logger.error('Failed to initialize digiCamControl', { error: error.message });
      throw new Error(
        `Failed to connect to camera via digiCamControl.\n` +
        `Error: ${error.message}\n` +
        `Please ensure digiCamControl is installed at: ${this.digiCamControlPath}`
      );
    }
  }

  /**
   * Initialize digiCamControl webserver (Windows)
   */
  private async initializeDigiCamControlWebserver(): Promise<void> {
    if (!this.digiCamControlClient) {
      throw new Error('DigiCamControl client not initialized');
    }

    try {
      const isAlive = await this.digiCamControlClient.ping();
      if (!isAlive) {
        throw new Error('DigiCamControl webserver is not responding');
      }

      // Set session folder to temp photo path
      const absoluteTempPath = path.resolve(env.tempPhotoPath);
      await this.digiCamControlClient.setSessionFolder(absoluteTempPath);

      // Ensure temp directory exists (async)
      await ensureDir(env.tempPhotoPath);

      this.isInitialized = true;
      logger.info('digiCamControl webserver initialized', {
        host: env.digiCamControl.host,
        port: env.digiCamControl.port,
        sessionFolder: absoluteTempPath,
      });
    } catch (error: any) {
      logger.error('Failed to initialize digiCamControl webserver', { error: error.message });
      throw new Error(
        `Failed to connect to DigiCamControl webserver.\n` +
        `Error: ${error.message}\n` +
        `Please ensure:\n` +
        `  1. DigiCamControl webserver is running on ${env.digiCamControl.host}:${env.digiCamControl.port}\n` +
        `  2. Camera is connected and recognized by DigiCamControl\n` +
        `  3. DIGICAMCONTROL_WEBSERVER_ENABLED=true in .env file`
      );
    }
  }

  /**
   * Initialize gphoto2 (Linux)
   */
  private initializeGphoto2(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.gphoto2.list((cameras: any[]) => {
        if (cameras.length === 0) {
          reject(new Error('No cameras detected'));
          return;
        }

        this.camera = cameras[0];
        this.isInitialized = true;

        logger.info('gphoto2 camera connected:', {
          model: this.camera.model,
          port: this.camera.port,
        });

        resolve();
      });
    });
  }

  /**
   * Check if camera is connected
   */
  isConnected(): boolean {
    return this.isInitialized;
  }

  /**
   * Capture photo and save to temp directory
   */
  async capturePhoto(sessionId: string, sequenceNumber: number): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    if (!this.isInitialized) {
      throw new Error('Camera not initialized');
    }

    if (this.cameraMode === 'webcam') {
      return this.captureWebcamPhoto(sessionId, sequenceNumber);
    }

    if (this.cameraMode === 'mock') {
      return this.captureMockPhoto(sessionId, sequenceNumber);
    }

    if (this.cameraMode === 'dslr-webserver') {
      return this.captureDigiCamControlWebserver(sessionId, sequenceNumber);
    }

    if (isWindows) {
      return this.captureDigiCamControl(sessionId, sequenceNumber);
    } else {
      return this.captureGphoto2(sessionId, sequenceNumber);
    }
  }

  /**
   * Capture using digiCamControl (Windows)
   */
  private async captureDigiCamControl(sessionId: string, sequenceNumber: number): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    logger.info('digiCamControl: Capturing photo...', { sessionId, sequenceNumber });

    const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
    const imagePath = path.join(env.tempPhotoPath, filename);

    // Ensure temp directory exists (async with caching)
    await ensureDir(env.tempPhotoPath);

    try {
      const cmdPath = path.join(this.digiCamControlPath, 'CameraControlCmd.exe');

      // Capture and download to specific path
      const command = `"${cmdPath}" /capture /filename "${imagePath}"`;
      logger.info('Executing capture command', { command });

      await execAsync(command, { timeout: 30000 });

      // Verify file was created
      if (!fs.existsSync(imagePath)) {
        throw new Error('Capture succeeded but image file not found');
      }

      logger.info('digiCamControl: Photo captured successfully', { imagePath });

      const metadata: CameraMetadata = {
        model: 'Canon EOS 550D',
        iso: 'Auto',
        shutterSpeed: 'Auto',
        aperture: 'Auto',
        focalLength: 'Unknown',
        timestamp: new Date().toISOString(),
      };

      return { imagePath, metadata };
    } catch (error: any) {
      logger.error('digiCamControl capture failed', { error: error.message });

      let errorMsg = 'Camera capture failed.\n';

      if (error.message.includes('timeout')) {
        errorMsg += 'Camera did not respond in time. Please check:\n' +
          '  - Camera is still powered ON\n' +
          '  - USB connection is stable\n' +
          '  - Camera is not in sleep mode';
      } else if (error.message.includes('image file not found')) {
        errorMsg += 'Photo was taken but file was not saved. Please check:\n' +
          '  - Disk space is available\n' +
          '  - Temp folder permissions are correct\n' +
          '  - Camera memory card is not full';
      } else {
        errorMsg += `Error: ${error.message}\n` +
          'Please ensure camera is connected and in Manual mode';
      }

      throw new Error(errorMsg);
    }
  }

  /**
   * Capture using digiCamControl webserver (Windows) with polling
   */
  private async captureDigiCamControlWebserver(sessionId: string, sequenceNumber: number): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    if (!this.digiCamControlClient) {
      throw new Error('DigiCamControl client not initialized');
    }

    logger.info('digiCamControl webserver: Capturing photo...', { sessionId, sequenceNumber });

    const filenameBase = `${sessionId}_${sequenceNumber}_${nanoid()}`;
    const imagePath = path.join(env.tempPhotoPath, `${filenameBase}.jpg`);

    // Ensure temp directory exists (async with caching)
    await ensureDir(env.tempPhotoPath);

    try {
      // Set filename template for this capture
      await this.digiCamControlClient.setFilenameTemplate(filenameBase);

      // Record capture start time
      const captureStartTime = Date.now();

      // Trigger capture
      logger.info('Triggering capture via webserver');
      await this.digiCamControlClient.capture();

      // Poll for image availability
      logger.info('Polling for image availability');
      const pollInterval = env.digiCamControl.pollIntervalMs;
      const timeout = env.digiCamControl.timeoutMs;
      const maxAttempts = Math.floor(timeout / pollInterval);

      let imageAvailable = false;
      let attempts = 0;

      while (!imageAvailable && attempts < maxAttempts) {
        attempts++;

        // Check if image is available
        const available = await this.digiCamControlClient.checkImageAvailable(filenameBase);

        if (available) {
          imageAvailable = true;
          logger.info('Image is available for download', { attempts, elapsed: Date.now() - captureStartTime });
          break;
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));

        if (attempts % 10 === 0) {
          logger.info('Still waiting for image...', { attempts, elapsed: Date.now() - captureStartTime });
        }
      }

      if (!imageAvailable) {
        throw new Error(
          `Capture timeout after ${timeout}ms. Camera did not save image in time.\n` +
          'Please check:\n' +
          '  - Camera is powered ON and responding\n' +
          '  - USB connection is stable\n' +
          '  - Camera memory card is not full\n' +
          '  - Autofocus is working (may need more time in low light)'
        );
      }

      // Download image
      logger.info('Downloading image from webserver');
      const imageBuffer = await this.digiCamControlClient.downloadImage(filenameBase);

      // Save to local temp folder (async)
      await fsPromises.writeFile(imagePath, imageBuffer);

      logger.info('digiCamControl webserver: Photo captured successfully', {
        imagePath,
        elapsed: Date.now() - captureStartTime,
      });

      const metadata: CameraMetadata = {
        model: 'Canon EOS 550D (webserver)',
        iso: 'Auto',
        shutterSpeed: 'Auto',
        aperture: 'Auto',
        focalLength: 'Unknown',
        timestamp: new Date().toISOString(),
      };

      return { imagePath, metadata };
    } catch (error: any) {
      logger.error('digiCamControl webserver capture failed', { error: error.message });

      let errorMsg = 'Camera capture failed via webserver.\n';

      if (error.message.includes('timeout') || error.message.includes('Capture timeout')) {
        errorMsg = error.message;
      } else if (error.message.includes('download')) {
        errorMsg += 'Image was captured but download failed. Please check:\n' +
          '  - Disk space is available\n' +
          '  - Network connection to webserver is stable';
      } else {
        errorMsg += `Error: ${error.message}\n` +
          'Please ensure DigiCamControl webserver is running and camera is connected';
      }

      throw new Error(errorMsg);
    }
  }

  /**
   * Capture using gphoto2 (Linux)
   */
  private captureGphoto2(sessionId: string, sequenceNumber: number): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    return new Promise((resolve, reject) => {
      logger.info('gphoto2: Capturing photo...', { sessionId, sequenceNumber });

      this.camera.takePicture({}, (err: any, data: Buffer) => {
        if (err) {
          logger.error('gphoto2 capture failed:', err);
          reject(new Error(`Capture failed: ${err.message}`));
          return;
        }

        try {
          const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
          const imagePath = path.join(env.tempPhotoPath, filename);

          // Ensure temp directory exists (sync for gphoto2 callback - will be cached after first call)
          if (!fs.existsSync(env.tempPhotoPath)) {
            fs.mkdirSync(env.tempPhotoPath, { recursive: true });
            initializedDirs.add(env.tempPhotoPath);
          }

          fs.writeFileSync(imagePath, data);

          logger.info('gphoto2: Photo captured successfully', { imagePath });

          const metadata: CameraMetadata = {
            model: this.camera.model || 'Unknown',
            iso: 'Auto',
            shutterSpeed: 'Auto',
            aperture: 'Auto',
            focalLength: 'Unknown',
            timestamp: new Date().toISOString(),
          };

          resolve({ imagePath, metadata });
        } catch (error: any) {
          logger.error('Failed to save photo:', error);
          reject(new Error(`Failed to save photo: ${error.message}`));
        }
      });
    });
  }

  /**
   * Mock camera capture for development
   */
  private async captureMockPhoto(sessionId: string, sequenceNumber: number): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    logger.info('Mock: Capturing photo...', { sessionId, sequenceNumber });

    // Simulate capture delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Create a simple 1x1 pixel JPEG for testing
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

    // Ensure temp directory exists (async with caching)
    await ensureDir(env.tempPhotoPath);

    await fsPromises.writeFile(imagePath, mockImageData);

    logger.info('Mock: Photo captured successfully', { imagePath });

    const metadata: CameraMetadata = {
      model: 'Canon EOS Mock Camera',
      iso: '200',
      shutterSpeed: '1/125',
      aperture: 'f/2.8',
      focalLength: '50mm',
      timestamp: new Date().toISOString(),
    };

    return { imagePath, metadata };
  }

  /**
   * Webcam capture using ffmpeg (Linux) or Windows camera
   */
  private async captureWebcamPhoto(sessionId: string, sequenceNumber: number): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    logger.info('Webcam: Capturing photo...', { sessionId, sequenceNumber });

    const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
    const imagePath = path.join(env.tempPhotoPath, filename);

    // Ensure temp directory exists (async with caching)
    await ensureDir(env.tempPhotoPath);

    try {
      let command: string;

      if (isWindows) {
        // Windows: Use ffmpeg with dshow
        command = `ffmpeg -f dshow -i video="USB Video Device" -frames:v 1 -y "${imagePath}"`;
      } else {
        // Linux: Use ffmpeg with v4l2
        command = `ffmpeg -f v4l2 -video_size 1280x720 -i ${this.webcamDevice} -frames:v 1 -update 1 -y "${imagePath}"`;
      }

      logger.info('Webcam: Running ffmpeg command');
      await execAsync(command, { timeout: 10000 });

      if (!fs.existsSync(imagePath)) {
        throw new Error('Image file was not created');
      }

      logger.info('Webcam: Photo captured successfully', { imagePath });

      const metadata: CameraMetadata = {
        model: 'Development Webcam',
        iso: 'N/A',
        shutterSpeed: 'N/A',
        aperture: 'N/A',
        focalLength: 'N/A',
        timestamp: new Date().toISOString(),
      };

      return { imagePath, metadata };
    } catch (error: any) {
      logger.error('Webcam capture failed:', error);
      throw new Error(`Webcam capture failed: ${error.message || error}`);
    }
  }

  /**
   * Get camera status
   */
  async getStatus(): Promise<CameraStatusResponse> {
    if (!this.isInitialized) {
      return {
        connected: false,
        model: 'No camera detected',
        battery: 0,
        storageAvailable: false,
        settings: {},
      };
    }

    if (this.cameraMode === 'webcam') {
      return {
        connected: true,
        model: 'Development Webcam',
        battery: 100,
        storageAvailable: true,
        settings: {
          iso: 'N/A',
          shutterSpeed: 'N/A',
          aperture: 'N/A',
          whiteBalance: 'auto',
          imageFormat: 'JPEG',
        },
      };
    }

    if (this.cameraMode === 'mock') {
      return {
        connected: true,
        model: 'Canon EOS Mock Camera',
        battery: 100,
        storageAvailable: true,
        settings: {
          iso: '200',
          shutterSpeed: '1/125',
          aperture: 'f/2.8',
          whiteBalance: 'auto',
          imageFormat: 'JPEG',
        },
      };
    }

    // Real camera
    let model = 'Canon DSLR';
    if (this.cameraMode === 'dslr-webserver') {
      model = 'Canon EOS 550D (webserver)';
    } else if (this.cameraMode === 'dslr-cli' && isWindows) {
      model = 'Canon EOS 550D (digiCamControl CLI)';
    } else if (this.camera?.model) {
      model = this.camera.model;
    }

    return {
      connected: true,
      model,
      battery: 100,
      storageAvailable: true,
      settings: {
        iso: 'Auto',
        shutterSpeed: 'Auto',
        aperture: 'Auto',
        whiteBalance: 'auto',
        imageFormat: 'JPEG',
      },
    };
  }

  /**
   * Configure camera settings
   */
  async configure(settings: Partial<CameraSettings>): Promise<CameraSettings> {
    if (!this.isInitialized) {
      throw new Error('Camera not initialized');
    }

    logger.info('Configuring camera:', settings);

    if (this.cameraMode === 'mock' || this.cameraMode === 'webcam') {
      return {
        iso: settings.iso || '200',
        shutterSpeed: settings.shutterSpeed || '1/125',
        aperture: settings.aperture || 'f/2.8',
        whiteBalance: settings.whiteBalance || 'auto',
        imageFormat: settings.imageFormat || 'JPEG',
      };
    }

    // TODO: Implement actual camera configuration for digiCamControl/gphoto2
    logger.warn('Camera configuration not fully implemented');

    return {
      iso: 'Auto',
      shutterSpeed: 'Auto',
      aperture: 'Auto',
      whiteBalance: 'auto',
      imageFormat: 'JPEG',
    };
  }

  /**
   * Disconnect camera
   */
  async disconnect(): Promise<void> {
    if (this.camera) {
      this.camera = null;
    }
    this.isInitialized = false;
    logger.info('Camera disconnected');
  }
}

// Singleton instance
let cameraService: CameraService | null = null;

export function getCameraService(): CameraService {
  if (!cameraService) {
    cameraService = new CameraService();
  }
  return cameraService;
}

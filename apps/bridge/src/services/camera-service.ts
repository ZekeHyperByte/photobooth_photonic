import { createLogger } from '@photonic/utils';
import { CameraMetadata, CameraSettings, CameraStatusResponse } from '@photonic/types';
import { env } from '../config/env';
import path from 'path';
import fs from 'fs';
import { nanoid } from 'nanoid';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const logger = createLogger('camera-service');

export class CameraService {
  private camera: any = null;
  private gphoto2: any = null;
  private isInitialized = false;
  private cameraMode: 'dslr' | 'webcam' | 'mock' = 'mock';
  private webcamDevice: string = '/dev/video0';

  constructor() {
    // Priority: Webcam (explicit) > DSLR > Mock
    if (env.useWebcam) {
      this.cameraMode = 'webcam';
      logger.info('Camera service running in WEBCAM MODE (using ffmpeg)');
    } else if (!env.mockCamera) {
      try {
        // Load gphoto2 module
        // Note: This requires gphoto2 to be installed on the system
        const GPhoto = require('gphoto2');
        this.gphoto2 = new GPhoto.GPhoto2();
        this.cameraMode = 'dslr';
        logger.info('gphoto2 module loaded');
      } catch (error) {
        logger.error('Failed to load gphoto2. Running in mock mode.', error);
        env.mockCamera = true;
      }
    }

    if (env.mockCamera && this.cameraMode !== 'webcam') {
      this.cameraMode = 'mock';
      logger.warn('Camera service running in MOCK MODE');
    }
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

    return new Promise((resolve, reject) => {
      this.gphoto2.list((cameras: any[]) => {
        if (cameras.length === 0) {
          reject(new Error('No cameras detected'));
          return;
        }

        this.camera = cameras[0];
        this.isInitialized = true;

        logger.info('Camera connected:', {
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

    return new Promise((resolve, reject) => {
      logger.info('Capturing photo...', { sessionId, sequenceNumber });

      this.camera.takePicture({}, (err: any, data: Buffer) => {
        if (err) {
          logger.error('Capture failed:', err);
          reject(new Error(`Capture failed: ${err.message}`));
          return;
        }

        try {
          // Generate filename
          const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
          const imagePath = path.join(env.tempPhotoPath, filename);

          // Save image
          fs.writeFileSync(imagePath, data);

          logger.info('Photo captured successfully:', imagePath);

          // Get camera metadata
          const metadata: CameraMetadata = {
            model: this.camera.model || 'Unknown',
            iso: 'Auto',
            shutterSpeed: 'Auto',
            aperture: 'Auto',
            focalLength: 'Unknown',
            timestamp: new Date().toISOString(),
          };

          resolve({
            imagePath,
            metadata,
          });
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

    // Create a simple 1x1 pixel image for testing
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

    // Ensure temp directory exists
    if (!fs.existsSync(env.tempPhotoPath)) {
      fs.mkdirSync(env.tempPhotoPath, { recursive: true });
    }

    fs.writeFileSync(imagePath, mockImageData);

    logger.info('Mock: Photo captured successfully:', imagePath);

    const metadata: CameraMetadata = {
      model: 'Canon EOS Mock Camera',
      iso: '200',
      shutterSpeed: '1/125',
      aperture: 'f/2.8',
      focalLength: '50mm',
      timestamp: new Date().toISOString(),
    };

    return {
      imagePath,
      metadata,
    };
  }

  /**
   * Webcam capture for development testing using ffmpeg
   */
  private async captureWebcamPhoto(sessionId: string, sequenceNumber: number): Promise<{
    imagePath: string;
    metadata: CameraMetadata;
  }> {
    logger.info('Webcam: Capturing photo...', { sessionId, sequenceNumber });

    const filename = `${sessionId}_${sequenceNumber}_${nanoid()}.jpg`;
    const imagePath = path.join(env.tempPhotoPath, filename);

    // Ensure temp directory exists
    if (!fs.existsSync(env.tempPhotoPath)) {
      fs.mkdirSync(env.tempPhotoPath, { recursive: true });
    }

    try {
      // Use ffmpeg to capture a single frame from the webcam
      const ffmpegCmd = `ffmpeg -f v4l2 -video_size 1280x720 -i ${this.webcamDevice} -frames:v 1 -update 1 -y "${imagePath}"`;
      logger.info('Webcam: Running ffmpeg command');

      await execAsync(ffmpegCmd, { timeout: 10000 });

      // Verify the file was created
      if (!fs.existsSync(imagePath)) {
        throw new Error('Image file was not created');
      }

      logger.info('Webcam: Photo captured successfully:', imagePath);

      const metadata: CameraMetadata = {
        model: 'Development Webcam',
        iso: 'N/A',
        shutterSpeed: 'N/A',
        aperture: 'N/A',
        focalLength: 'N/A',
        timestamp: new Date().toISOString(),
      };

      return {
        imagePath,
        metadata,
      };
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

    try {
      return {
        connected: true,
        model: this.camera?.model || 'Unknown',
        battery: 100, // gphoto2 doesn't always provide battery info
        storageAvailable: true,
        settings: {
          iso: 'Auto',
          shutterSpeed: 'Auto',
          aperture: 'Auto',
          whiteBalance: 'auto',
          imageFormat: 'JPEG',
        },
      };
    } catch (error: any) {
      logger.error('Failed to get camera status:', error);
      throw new Error(`Failed to get camera status: ${error.message}`);
    }
  }

  /**
   * Configure camera settings
   */
  async configure(settings: Partial<CameraSettings>): Promise<CameraSettings> {
    if (!this.isInitialized) {
      throw new Error('Camera not initialized');
    }

    logger.info('Configuring camera:', settings);

    if (env.mockCamera) {
      logger.info('Mock: Camera configured');
      return {
        iso: settings.iso || '200',
        shutterSpeed: settings.shutterSpeed || '1/125',
        aperture: settings.aperture || 'f/2.8',
        whiteBalance: settings.whiteBalance || 'auto',
        imageFormat: settings.imageFormat || 'JPEG',
      };
    }

    // Note: Actual gphoto2 configuration would go here
    // This requires more complex interaction with gphoto2 API
    logger.warn('Camera configuration not fully implemented yet');

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
      // gphoto2 auto-disconnects
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

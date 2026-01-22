import { Router } from 'express';
import { getCameraService } from '../services/camera-service';
import { createLogger } from '@photonic/utils';
import {
  CameraCaptureRequest,
  ConfigureCameraRequest,
} from '@photonic/types';

const router = Router();
const logger = createLogger('camera-routes');

/**
 * POST /camera/capture
 * Trigger photo capture
 */
router.post('/capture', async (req, res) => {
  try {
    const { sessionId, sequenceNumber } = req.body as CameraCaptureRequest;

    if (!sessionId || !sequenceNumber) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'sessionId and sequenceNumber are required',
      });
    }

    logger.info('Capture request:', { sessionId, sequenceNumber });

    const cameraService = getCameraService();

    // Initialize camera if not already done
    if (!cameraService.isConnected()) {
      await cameraService.initialize();
    }

    // Capture photo
    const result = await cameraService.capturePhoto(sessionId, sequenceNumber);

    res.json({
      success: true,
      imagePath: result.imagePath,
      metadata: result.metadata,
    });
  } catch (error: any) {
    logger.error('Capture failed:', error);
    res.status(500).json({
      success: false,
      error: 'Capture Failed',
      message: error.message,
    });
  }
});

/**
 * GET /camera/status
 * Get camera status and settings
 */
router.get('/status', async (req, res) => {
  try {
    const cameraService = getCameraService();
    const status = await cameraService.getStatus();

    res.json(status);
  } catch (error: any) {
    logger.error('Failed to get camera status:', error);
    res.status(500).json({
      error: 'Status Error',
      message: error.message,
    });
  }
});

/**
 * POST /camera/configure
 * Configure camera settings
 */
router.post('/configure', async (req, res) => {
  try {
    const settings = req.body as ConfigureCameraRequest;

    logger.info('Configure request:', settings);

    const cameraService = getCameraService();

    if (!cameraService.isConnected()) {
      await cameraService.initialize();
    }

    const result = await cameraService.configure(settings);

    res.json({
      success: true,
      settings: result,
    });
  } catch (error: any) {
    logger.error('Configuration failed:', error);
    res.status(500).json({
      success: false,
      error: 'Configuration Failed',
      message: error.message,
    });
  }
});

/**
 * GET /camera/detect
 * Detect available cameras
 */
router.get('/detect', async (req, res) => {
  try {
    const cameraService = getCameraService();

    if (!cameraService.isConnected()) {
      await cameraService.initialize();
    }

    const status = await cameraService.getStatus();

    res.json({
      cameras: status.connected
        ? [
            {
              model: status.model,
              port: 'usb',
              abilities: ['capture', 'preview'],
            },
          ]
        : [],
    });
  } catch (error: any) {
    logger.error('Detection failed:', error);
    res.json({
      cameras: [],
    });
  }
});

/**
 * GET /camera/preview
 * Get camera preview stream (placeholder for future implementation)
 */
router.get('/preview', (req, res) => {
  res.status(501).json({
    error: 'Not Implemented',
    message: 'Preview stream not yet implemented',
  });
});

export default router;

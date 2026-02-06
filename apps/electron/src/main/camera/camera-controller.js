/**
 * High-Level Camera Controller
 * Uses GPhoto2 on Linux (replaces Canon SDK)
 *
 * Features:
 * - Multi-brand support (Canon, Nikon, Sony via gphoto2)
 * - Session lifecycle management
 * - Photo capture with auto-retry
 * - Live view streaming
 * - Health monitoring
 * - Error recovery
 */

const GPhoto2Wrapper = require("./gphoto2-wrapper");
const EventEmitter = require("events");
const path = require("path");
const fs = require("fs").promises;

class CameraController extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxRetries: options.maxRetries || 5,
      retryDelay: options.retryDelay || 1000,
      liveViewFps: options.liveViewFps || 30,
      photoDir: options.photoDir || "./photos",
      mockMode: options.mockMode || false,
      ...options,
    };

    this.gphoto2 = null;
    this.isConnected = false;
    this.isCapturing = false;
    this.liveViewActive = false;
    this.lastPhoto = null;
    this.healthCheckInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.currentSession = null;

    // Ensure photo directory exists
    this.ensurePhotoDir();
  }

  /**
   * Initialize camera controller
   */
  async initialize() {
    try {
      console.log("Initializing camera controller...");

      // Initialize GPhoto2
      this.gphoto2 = new GPhoto2Wrapper({
        photoDir: this.options.photoDir,
        mockMode: this.options.mockMode,
        maxRetries: this.options.maxRetries,
        retryDelay: this.options.retryDelay,
      });

      // Set up event handlers
      this.setupEventHandlers();

      // Initialize GPhoto2
      await this.gphoto2.initialize();

      this.isConnected = true;
      this.reconnectAttempts = 0;

      // Start health monitoring
      this.startHealthCheck();

      console.log("✅ Camera controller initialized");
      this.emit("ready", {
        connected: this.isConnected,
        mock: this.options.mockMode,
      });

      return true;
    } catch (error) {
      console.error(
        "❌ Camera controller initialization failed:",
        error.message,
      );
      this.emit("error", error);

      // Don't throw if in mock mode
      if (this.options.mockMode) {
        return true;
      }

      throw error;
    }
  }

  /**
   * Setup event handlers for GPhoto2
   */
  setupEventHandlers() {
    if (!this.gphoto2) return;

    this.gphoto2.on("ready", (data) => {
      this.emit("ready", data);
    });

    this.gphoto2.on("error", (error) => {
      console.error("GPhoto2 error:", error.message);
      this.emit("error", error);
    });

    this.gphoto2.on("liveViewStarted", () => {
      this.emit("liveViewStarted");
    });

    this.gphoto2.on("liveViewStopped", () => {
      this.emit("liveViewStopped");
    });

    this.gphoto2.on("liveViewError", (error) => {
      console.error("Live view error:", error.message);
      this.emit("liveViewError", error);
    });
  }

  /**
   * Start live view (preview)
   */
  async startLiveView(onFrame) {
    if (!this.gphoto2) {
      throw new Error("Camera not initialized");
    }

    try {
      await this.gphoto2.startLiveView((buffer) => {
        if (onFrame) {
          onFrame(buffer);
        }
        this.emit("liveViewFrame", buffer);
      });

      this.liveViewActive = true;

      console.log("🎥 Live view started");
      this.emit("liveViewStarted");

      return true;
    } catch (error) {
      console.error("Failed to start live view:", error.message);
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Stop live view
   */
  async stopLiveView() {
    if (!this.gphoto2) {
      return true;
    }

    try {
      await this.gphoto2.stopLiveView();
      this.liveViewActive = false;

      console.log("🛑 Live view stopped");
      this.emit("liveViewStopped");

      return true;
    } catch (error) {
      console.error("Error stopping live view:", error.message);
      throw error;
    }
  }

  /**
   * Capture photo
   */
  async capturePhoto(photoNumber = 1, sessionId = null) {
    if (this.isCapturing) {
      throw new Error("Already capturing");
    }

    this.isCapturing = true;
    this.currentSession = sessionId;

    this.emit("captureStart", { photoNumber, sessionId });

    try {
      let photoPath;
      let result;

      // Stop live view before capture (if active)
      const wasLiveView = this.liveViewActive;
      if (wasLiveView) {
        await this.stopLiveView();
      }

      try {
        // Capture using gphoto2
        result = await this.gphoto2.capturePhoto(photoNumber);
        photoPath = result.photoPath;
      } finally {
        // Restart live view if it was active
        if (wasLiveView && !this.options.mockMode) {
          try {
            await this.startLiveView();
          } catch (error) {
            console.warn("Failed to restart live view:", error.message);
          }
        }
      }

      this.lastPhoto = photoPath;

      console.log(`✅ Photo ${photoNumber} captured: ${photoPath}`);

      this.emit("captureComplete", {
        photoNumber,
        photoPath,
        sessionId,
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        photoNumber,
        photoPath,
        sessionId,
        timestamp: new Date().toISOString(),
        attempts: result.attempts || 1,
        mock: result.mock || false,
      };
    } catch (error) {
      console.error(`Photo ${photoNumber} capture failed:`, error.message);

      this.emit("captureError", {
        photoNumber,
        sessionId,
        error: error.message,
      });

      throw error;
    } finally {
      this.isCapturing = false;
      this.currentSession = null;
    }
  }

  /**
   * Capture multiple photos (e.g., 3 photos for a package)
   */
  async captureMultiple(count, sessionId = null, onProgress = null) {
    const photos = [];

    for (let i = 1; i <= count; i++) {
      if (onProgress) {
        onProgress({ current: i, total: count });
      }

      try {
        const result = await this.capturePhoto(i, sessionId);
        photos.push(result);

        // Small delay between photos
        if (i < count) {
          await this.sleep(1000);
        }
      } catch (error) {
        console.error(`Failed to capture photo ${i}:`, error.message);

        // Continue with remaining photos
        photos.push({
          success: false,
          photoNumber: i,
          error: error.message,
        });
      }
    }

    return {
      success: photos.every((p) => p.success),
      count: photos.length,
      photos,
      sessionId,
    };
  }

  /**
   * Get camera status
   */
  async getStatus() {
    const status = {
      connected: this.isConnected,
      capturing: this.isCapturing,
      liveViewActive: this.liveViewActive,
      mockMode: this.options.mockMode,
      lastPhoto: this.lastPhoto,
      gphoto2Initialized: !!this.gphoto2,
    };

    if (this.gphoto2) {
      const gphotoStatus = await this.gphoto2.getStatus();
      Object.assign(status, gphotoStatus);
    }

    return status;
  }

  /**
   * Set camera property
   */
  async setProperty(propertyName, value) {
    if (!this.gphoto2) {
      throw new Error("Camera not initialized");
    }

    try {
      await this.gphoto2.setProperty(propertyName, value);
      return true;
    } catch (error) {
      console.error("Failed to set property:", error.message);
      throw error;
    }
  }

  /**
   * Get camera property
   */
  async getProperty(propertyName) {
    if (!this.gphoto2) {
      throw new Error("Camera not initialized");
    }

    try {
      return await this.gphoto2.getProperty(propertyName);
    } catch (error) {
      console.error("Failed to get property:", error.message);
      throw error;
    }
  }

  /**
   * List available camera properties
   */
  async listProperties() {
    if (!this.gphoto2) {
      throw new Error("Camera not initialized");
    }

    try {
      return await this.gphoto2.listProperties();
    } catch (error) {
      console.error("Failed to list properties:", error.message);
      throw error;
    }
  }

  /**
   * Reconnect to camera
   */
  async reconnect() {
    try {
      console.log("Reconnecting to camera...");

      // Cleanup current connection
      if (this.gphoto2) {
        await this.gphoto2.cleanup();
      }

      // Reset gphoto2 instance
      this.gphoto2 = null;
      this.isConnected = false;
      this.liveViewActive = false;

      // Re-initialize
      await this.initialize();

      this.reconnectAttempts = 0;

      console.log("✅ Camera reconnected");
      this.emit("reconnected");

      return true;
    } catch (error) {
      this.reconnectAttempts++;
      console.error(
        `Reconnect attempt ${this.reconnectAttempts} failed:`,
        error.message,
      );

      this.emit("reconnectFailed", {
        attempt: this.reconnectAttempts,
        error: error.message,
      });

      throw error;
    }
  }

  /**
   * Start health check monitoring
   */
  startHealthCheck() {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        const status = await this.getStatus();

        if (!status.connected || !status.initialized) {
          console.log("Health check: Camera disconnected");

          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            console.log(
              `Health check: Attempting reconnect ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts}`,
            );

            try {
              await this.reconnect();
            } catch (error) {
              console.error("Reconnect failed:", error.message);
            }
          } else {
            console.error("Max reconnect attempts reached");
            this.emit("maxReconnectReached");
          }
        } else {
          // Reset reconnect counter on successful health check
          if (this.reconnectAttempts > 0) {
            this.reconnectAttempts = 0;
            console.log(
              "Health check: Camera healthy, reset reconnect counter",
            );
          }
        }

        // Emit health status
        this.emit("healthCheck", status);
      } catch (error) {
        console.error("Health check error:", error.message);
        this.emit("healthError", error);
      }
    }, 5000); // Check every 5 seconds
  }

  /**
   * Stop health check monitoring
   */
  stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Ensure photo directory exists
   */
  async ensurePhotoDir() {
    try {
      await fs.mkdir(this.options.photoDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  /**
   * Get last captured photo path
   */
  getLastPhoto() {
    return this.lastPhoto;
  }

  /**
   * Download all photos from camera
   */
  async downloadAllPhotos() {
    if (!this.gphoto2) {
      throw new Error("Camera not initialized");
    }

    try {
      return await this.gphoto2.downloadAll();
    } catch (error) {
      console.error("Failed to download photos:", error.message);
      throw error;
    }
  }

  /**
   * Delete photo from camera
   */
  async deletePhoto(filePath) {
    if (!this.gphoto2) {
      throw new Error("Camera not initialized");
    }

    try {
      return await this.gphoto2.deleteImage(filePath);
    } catch (error) {
      console.error("Failed to delete photo:", error.message);
      throw error;
    }
  }

  /**
   * Reset camera
   */
  async reset() {
    if (!this.gphoto2) {
      throw new Error("Camera not initialized");
    }

    try {
      await this.stopLiveView();
      await this.gphoto2.reset();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      return true;
    } catch (error) {
      console.error("Camera reset failed:", error.message);
      throw error;
    }
  }

  /**
   * Cleanup and shutdown
   */
  async shutdown() {
    console.log("Shutting down camera controller...");

    this.stopHealthCheck();

    if (this.liveViewActive) {
      try {
        await this.stopLiveView();
      } catch (error) {
        console.warn("Error stopping live view:", error.message);
      }
    }

    if (this.gphoto2) {
      try {
        await this.gphoto2.cleanup();
      } catch (error) {
        console.warn("Error cleaning up gphoto2:", error.message);
      }
      this.gphoto2 = null;
    }

    this.isConnected = false;

    console.log("✅ Camera controller shutdown complete");
  }

  /**
   * Utility: Sleep function
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = CameraController;

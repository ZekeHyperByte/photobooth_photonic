/**
 * GPhoto2 Wrapper for Linux
 * Replaces Canon SDK with gphoto2 CLI commands
 *
 * Features:
 * - Camera control via gphoto2 CLI
 * - Live view (MJPEG stream)
 * - Photo capture with retry
 * - Multi-brand support (Canon, Nikon, Sony)
 * - More reliable than digiCamControl
 */

const { spawn, exec } = require("child_process");
const EventEmitter = require("events");
const path = require("path");
const fs = require("fs").promises;

class GPhoto2Wrapper extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      maxRetries: options.maxRetries || 5,
      retryDelay: options.retryDelay || 1000,
      photoDir: options.photoDir || "./photos",
      mockMode: options.mockMode || false,
      ...options,
    };

    this.isInitialized = false;
    this.camera = null;
    this.liveViewProcess = null;
    this.lastPhoto = null;
    this.retryCount = 0;

    // Ensure photo directory exists
    this.ensurePhotoDir();
  }

  /**
   * Initialize and detect camera
   */
  async initialize() {
    if (this.options.mockMode) {
      console.log("📷 GPhoto2 wrapper in MOCK mode");
      this.isInitialized = true;
      this.emit("ready", { mock: true });
      return true;
    }

    try {
      // Check if gphoto2 is installed
      await this.checkGPhoto2();

      // Auto-detect camera
      const cameras = await this.detectCameras();

      if (cameras.length === 0) {
        throw new Error("No cameras detected via gphoto2");
      }

      this.camera = cameras[0];
      this.isInitialized = true;

      console.log("✅ GPhoto2 initialized:", this.camera.model);
      this.emit("ready", { mock: false, camera: this.camera });

      return true;
    } catch (error) {
      console.error("❌ GPhoto2 initialization failed:", error.message);
      this.emit("error", error);
      throw error;
    }
  }

  /**
   * Check if gphoto2 is installed
   */
  async checkGPhoto2() {
    return new Promise((resolve, reject) => {
      exec("which gphoto2", (error, stdout) => {
        if (error) {
          reject(
            new Error(
              "gphoto2 not installed. Run: sudo apt-get install gphoto2",
            ),
          );
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Detect connected cameras
   */
  async detectCameras() {
    return new Promise((resolve, reject) => {
      exec("gphoto2 --auto-detect", (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`Failed to detect cameras: ${error.message}`));
          return;
        }

        // Parse output
        const lines = stdout.split("\n").filter((line) => line.trim());
        const cameras = [];

        // Skip header lines
        for (let i = 2; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line && !line.includes("------")) {
            // Extract model and port
            const parts = line.split("\t").filter((p) => p.trim());
            if (parts.length >= 2) {
              cameras.push({
                model: parts[0].trim(),
                port: parts[1].trim(),
              });
            }
          }
        }

        resolve(cameras);
      });
    });
  }

  /**
   * Get camera status
   */
  async getStatus() {
    if (this.options.mockMode) {
      return {
        initialized: true,
        connected: true,
        model: "Mock Camera",
        port: "usb:",
        battery: 100,
        shotsAvailable: 999,
      };
    }

    if (!this.isInitialized) {
      return { initialized: false, connected: false };
    }

    try {
      // Get camera summary
      const summary = await this.getCameraSummary();

      return {
        initialized: this.isInitialized,
        connected: !!this.camera,
        model: this.camera?.model || "Unknown",
        port: this.camera?.port || "usb:",
        ...summary,
      };
    } catch (error) {
      return {
        initialized: this.isInitialized,
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Get camera summary (battery, shots, etc.)
   */
  async getCameraSummary() {
    return new Promise((resolve, reject) => {
      exec("gphoto2 --summary", { timeout: 5000 }, (error, stdout) => {
        if (error) {
          resolve({ battery: null, shotsAvailable: null });
          return;
        }

        // Parse battery level
        const batteryMatch = stdout.match(/Battery Level:\s*(\d+)%/i);
        const battery = batteryMatch ? parseInt(batteryMatch[1]) : null;

        // Parse shots available
        const shotsMatch =
          stdout.match(/Free Images in Memory:\s*(\d+)/i) ||
          stdout.match(/Free Space:\s*(\d+)\s*images/i);
        const shotsAvailable = shotsMatch ? parseInt(shotsMatch[1]) : null;

        resolve({ battery, shotsAvailable });
      });
    });
  }

  /**
   * Capture photo with retry logic
   */
  async capturePhoto(photoNumber = 1, retryAttempt = 0) {
    if (this.options.mockMode) {
      return this.mockCapture(photoNumber);
    }

    if (!this.isInitialized) {
      throw new Error("GPhoto2 not initialized");
    }

    try {
      console.log(
        `📸 Capture attempt ${retryAttempt + 1}/${this.options.maxRetries} for photo ${photoNumber}`,
      );

      const timestamp = Date.now();
      const filename = `photo_${photoNumber}_${timestamp}.jpg`;
      const outputPath = path.join(this.options.photoDir, filename);

      // Build gphoto2 command
      const args = [
        "--capture-image-and-download",
        "--filename",
        outputPath,
        "--force-overwrite",
      ];

      // Execute capture
      await this.executeCommand("gphoto2", args, 30000); // 30 second timeout

      // Verify file was created
      await fs.access(outputPath);

      this.lastPhoto = outputPath;
      this.retryCount = 0;

      console.log(`✅ Photo ${photoNumber} captured: ${outputPath}`);

      return {
        success: true,
        photoNumber,
        photoPath: outputPath,
        filename,
        timestamp: new Date().toISOString(),
        attempts: retryAttempt + 1,
      };
    } catch (error) {
      console.error(
        `Capture attempt ${retryAttempt + 1} failed:`,
        error.message,
      );

      if (retryAttempt < this.options.maxRetries - 1) {
        const delay = this.options.retryDelay * (retryAttempt + 1);
        console.log(`Waiting ${delay}ms before retry...`);

        await this.sleep(delay);
        return this.capturePhoto(photoNumber, retryAttempt + 1);
      }

      throw new Error(
        `Failed to capture after ${this.options.maxRetries} attempts: ${error.message}`,
      );
    }
  }

  /**
   * Start live view (preview)
   */
  async startLiveView(onFrame) {
    if (this.options.mockMode) {
      this.startMockLiveView(onFrame);
      return true;
    }

    if (!this.isInitialized) {
      throw new Error("GPhoto2 not initialized");
    }

    try {
      // Stop any existing live view
      await this.stopLiveView();

      // Start live view stream
      // gphoto2 can output preview frames to stdout
      this.liveViewProcess = spawn("gphoto2", [
        "--capture-preview",
        "--stdout",
        "--interval",
        "1", // 1 frame per second (adjust as needed)
      ]);

      let buffer = Buffer.alloc(0);

      this.liveViewProcess.stdout.on("data", (data) => {
        buffer = Buffer.concat([buffer, data]);

        // Look for JPEG markers in stream
        // JPEG starts with 0xFFD8 and ends with 0xFFD9
        let startIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]));
        let endIdx = buffer.indexOf(Buffer.from([0xff, 0xd9]));

        while (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
          // Extract complete JPEG
          const jpegBuffer = buffer.slice(startIdx, endIdx + 2);

          if (onFrame) {
            onFrame(jpegBuffer);
          }

          // Remove processed frame from buffer
          buffer = buffer.slice(endIdx + 2);

          // Look for next frame
          startIdx = buffer.indexOf(Buffer.from([0xff, 0xd8]));
          endIdx = buffer.indexOf(Buffer.from([0xff, 0xd9]));
        }

        // Prevent buffer from growing too large
        if (buffer.length > 10 * 1024 * 1024) {
          // 10MB limit
          buffer = buffer.slice(-5 * 1024 * 1024); // Keep last 5MB
        }
      });

      this.liveViewProcess.stderr.on("data", (data) => {
        console.error("Live view error:", data.toString());
      });

      this.liveViewProcess.on("error", (error) => {
        console.error("Live view process error:", error);
        this.emit("liveViewError", error);
      });

      this.liveViewProcess.on("exit", (code) => {
        if (code !== 0) {
          console.log(`Live view process exited with code ${code}`);
        }
      });

      console.log("🎥 Live view started");
      this.emit("liveViewStarted");

      return true;
    } catch (error) {
      console.error("Failed to start live view:", error.message);
      throw error;
    }
  }

  /**
   * Stop live view
   */
  async stopLiveView() {
    if (this.liveViewProcess) {
      try {
        this.liveViewProcess.kill("SIGTERM");

        // Wait for process to exit (max 5 seconds)
        await new Promise((resolve) => {
          const timeout = setTimeout(() => {
            this.liveViewProcess.kill("SIGKILL");
            resolve();
          }, 5000);

          this.liveViewProcess.on("exit", () => {
            clearTimeout(timeout);
            resolve();
          });
        });

        this.liveViewProcess = null;
        console.log("🛑 Live view stopped");
        this.emit("liveViewStopped");
      } catch (error) {
        console.error("Error stopping live view:", error.message);
      }
    }
  }

  /**
   * Set camera property (ISO, aperture, shutter, etc.)
   */
  async setProperty(propertyName, value) {
    if (this.options.mockMode) {
      console.log(`Mock: Set ${propertyName} = ${value}`);
      return true;
    }

    return new Promise((resolve, reject) => {
      exec(
        `gphoto2 --set-config ${propertyName}=${value}`,
        { timeout: 10000 },
        (error) => {
          if (error) {
            reject(
              new Error(`Failed to set ${propertyName}: ${error.message}`),
            );
          } else {
            console.log(`Set ${propertyName} = ${value}`);
            resolve(true);
          }
        },
      );
    });
  }

  /**
   * Get camera property
   */
  async getProperty(propertyName) {
    if (this.options.mockMode) {
      const mockValues = {
        iso: 400,
        aperture: 5.6,
        shutterspeed: "1/125",
        whitebalance: "Auto",
        batterylevel: 80,
      };
      return mockValues[propertyName.toLowerCase()] || 0;
    }

    return new Promise((resolve, reject) => {
      exec(
        `gphoto2 --get-config ${propertyName}`,
        { timeout: 10000 },
        (error, stdout) => {
          if (error) {
            reject(
              new Error(`Failed to get ${propertyName}: ${error.message}`),
            );
            return;
          }

          // Parse value from output
          const match = stdout.match(/Current:\s*(.+)/);
          if (match) {
            resolve(match[1].trim());
          } else {
            resolve(null);
          }
        },
      );
    });
  }

  /**
   * List available camera properties
   */
  async listProperties() {
    return new Promise((resolve, reject) => {
      exec("gphoto2 --list-config", { timeout: 10000 }, (error, stdout) => {
        if (error) {
          reject(new Error(`Failed to list properties: ${error.message}`));
          return;
        }

        const properties = stdout
          .split("\n")
          .filter((line) => line.trim().startsWith("/"))
          .map((line) => line.trim());

        resolve(properties);
      });
    });
  }

  /**
   * Download all images from camera
   */
  async downloadAll() {
    return new Promise((resolve, reject) => {
      exec(
        `gphoto2 --get-all-files --filename ${this.options.photoDir}/%Y%m%d-%H%M%S.%C`,
        { timeout: 60000 },
        (error, stdout) => {
          if (error) {
            reject(new Error(`Download failed: ${error.message}`));
          } else {
            console.log("Downloaded all images:", stdout);
            resolve(true);
          }
        },
      );
    });
  }

  /**
   * Delete image from camera
   */
  async deleteImage(filePath) {
    return new Promise((resolve, reject) => {
      exec(
        `gphoto2 --delete-file "${filePath}"`,
        { timeout: 10000 },
        (error) => {
          if (error) {
            reject(new Error(`Delete failed: ${error.message}`));
          } else {
            resolve(true);
          }
        },
      );
    });
  }

  /**
   * Reset camera (useful after errors)
   */
  async reset() {
    try {
      // Stop any ongoing operations
      await this.stopLiveView();

      // Reset camera via USB reset (requires sudo or udev rules)
      console.log("Resetting camera connection...");

      // Re-initialize
      await this.sleep(2000);
      await this.initialize();

      console.log("✅ Camera reset complete");
      return true;
    } catch (error) {
      console.error("Reset failed:", error.message);
      throw error;
    }
  }

  /**
   * Execute gphoto2 command with timeout
   */
  executeCommand(command, args, timeout) {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      let stdout = "";
      let stderr = "";
      let timeoutId;

      process.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      process.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      process.on("error", (error) => {
        clearTimeout(timeoutId);
        reject(error);
      });

      process.on("exit", (code) => {
        clearTimeout(timeoutId);

        if (code !== 0) {
          reject(
            new Error(`Command failed (exit ${code}): ${stderr || stdout}`),
          );
        } else {
          resolve(stdout);
        }
      });

      // Set timeout
      timeoutId = setTimeout(() => {
        process.kill("SIGTERM");
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * Mock capture for testing without camera
   */
  async mockCapture(photoNumber) {
    console.log(`📸 Mock capture photo ${photoNumber}`);

    await this.sleep(500); // Simulate capture time

    const timestamp = Date.now();
    const filename = `mock_photo_${photoNumber}_${timestamp}.jpg`;
    const outputPath = path.join(this.options.photoDir, filename);

    // Create a simple test image (or copy a template)
    try {
      // Create a simple colored test image using Node.js
      const width = 1920;
      const height = 1080;

      // Simple PPM format (easiest to generate without libraries)
      const header = `P6\n${width} ${height}\n255\n`;
      const pixelData = Buffer.alloc(width * height * 3);

      // Fill with gradient
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 3;
          pixelData[idx] = Math.floor((x / width) * 255); // R
          pixelData[idx + 1] = Math.floor((y / height) * 255); // G
          pixelData[idx + 2] = 128; // B
        }
      }

      // Note: In production, you'd use Sharp or similar to create JPEG
      // For now, just create a placeholder
      await fs.writeFile(
        outputPath,
        Buffer.concat([Buffer.from(header), pixelData]),
      );
    } catch (error) {
      console.error("Mock capture error:", error);
    }

    this.lastPhoto = outputPath;

    return {
      success: true,
      photoNumber,
      photoPath: outputPath,
      filename,
      timestamp: new Date().toISOString(),
      mock: true,
    };
  }

  /**
   * Start mock live view
   */
  startMockLiveView(onFrame) {
    console.log("🎥 Mock live view started");

    const generateFrame = async () => {
      if (!this.liveViewProcess) return; // Stop signal

      try {
        // Generate a simple colored frame
        const width = 640;
        const height = 480;
        const buffer = Buffer.alloc(width * height * 3);

        const time = Date.now() / 1000;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const idx = (y * width + x) * 3;
            buffer[idx] = Math.floor((Math.sin(time + x / 50) + 1) * 127.5); // R
            buffer[idx + 1] = Math.floor((Math.cos(time + y / 50) + 1) * 127.5); // G
            buffer[idx + 2] = 100; // B
          }
        }

        if (onFrame) {
          onFrame(buffer);
        }
      } catch (error) {
        console.error("Mock live view error:", error);
      }

      // Continue at ~30fps
      setTimeout(generateFrame, 33);
    };

    // Use this as a flag
    this.liveViewProcess = {
      kill: () => {
        this.liveViewProcess = null;
      },
    };
    generateFrame();
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
   * Sleep utility
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup
   */
  async cleanup() {
    try {
      await this.stopLiveView();
      this.isInitialized = false;
      console.log("GPhoto2 wrapper cleaned up");
    } catch (error) {
      console.error("Cleanup error:", error);
    }
  }
}

module.exports = GPhoto2Wrapper;

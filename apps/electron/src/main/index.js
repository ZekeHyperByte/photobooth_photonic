/**
 * Electron Main Process Entry Point
 *
 * Features:
 * - Embedded Fastify backend
 * - Camera integration
 * - IPC handlers for renderer
 * - Window management
 * - Auto-updater (placeholder)
 */

const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const path = require("path");
const fs = require("fs");

// Import camera controller
const { CameraController } = require("./camera");

// Import backend server
const createBackend = require("./backend/server");

// Global references
let mainWindow = null;
let tray = null;
let backend = null;
let camera = null;
let isQuitting = false;

// Configuration
const CONFIG = {
  isDev: process.env.NODE_ENV === "development",
  backendPort: process.env.BACKEND_PORT || 4000,
  photoDir: process.env.PHOTO_DIR || "./photos",
  mockCamera: process.env.MOCK_CAMERA === "true",
  autoStart: true,
};

/**
 * Create main window (Kiosk)
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    fullscreen: !CONFIG.isDev, // Full screen in production
    kiosk: !CONFIG.isDev, // Kiosk mode in production
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    icon: path.join(__dirname, "../../assets/icon.png"),
    show: false, // Show when ready
  });

  // Load the UI
  const uiPath = CONFIG.isDev
    ? "http://localhost:3000" // Dev server
    : `file://${path.join(__dirname, "../renderer/build/index.html")}`;

  mainWindow.loadURL(uiPath);

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();

    if (CONFIG.isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window close
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Create system tray
 */
function createTray() {
  const iconPath = path.join(__dirname, "../../assets/tray-icon.png");

  // Create a simple icon if file doesn't exist
  let trayIcon;
  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
  } else {
    // Create empty icon (16x16)
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Photobooth",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "Camera Status",
      enabled: false,
    },
    {
      type: "separator",
    },
    {
      label: "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip("Photonic Photobooth");
  tray.setContextMenu(contextMenu);

  tray.on("click", () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
      }
    }
  });

  return tray;
}

/**
 * Initialize backend server
 */
async function initBackend() {
  try {
    backend = await createBackend({
      port: CONFIG.backendPort,
      photoDir: CONFIG.photoDir,
      camera: camera,
    });

    console.log(`✅ Backend server running on port ${CONFIG.backendPort}`);

    return backend;
  } catch (error) {
    console.error("❌ Failed to start backend:", error.message);
    throw error;
  }
}

/**
 * Initialize camera controller
 */
async function initCamera() {
  try {
    camera = new CameraController({
      photoDir: CONFIG.photoDir,
      mockMode: CONFIG.mockCamera,
      maxRetries: 5,
      retryDelay: 1000,
    });

    // Set up event handlers
    camera.on("ready", (data) => {
      console.log("📷 Camera ready:", data);
      updateTrayStatus("Ready");
    });

    camera.on("connected", () => {
      console.log("📷 Camera connected");
      updateTrayStatus("Connected");
      if (mainWindow) {
        mainWindow.webContents.send("camera:connected");
      }
    });

    camera.on("disconnected", (error) => {
      console.log("📷 Camera disconnected:", error?.message);
      updateTrayStatus("Disconnected");
      if (mainWindow) {
        mainWindow.webContents.send("camera:disconnected", error?.message);
      }
    });

    camera.on("captureStart", (data) => {
      console.log("📸 Capture started:", data);
      if (mainWindow) {
        mainWindow.webContents.send("camera:captureStart", data);
      }
    });

    camera.on("captureComplete", (data) => {
      console.log("📸 Capture complete:", data);
      if (mainWindow) {
        mainWindow.webContents.send("camera:captureComplete", data);
      }
    });

    camera.on("captureError", (data) => {
      console.error("📸 Capture error:", data);
      if (mainWindow) {
        mainWindow.webContents.send("camera:captureError", data);
      }
    });

    camera.on("liveViewStarted", () => {
      console.log("🎥 Live view started");
      if (mainWindow) {
        mainWindow.webContents.send("camera:liveViewStarted");
      }
    });

    camera.on("liveViewStopped", () => {
      console.log("🛑 Live view stopped");
      if (mainWindow) {
        mainWindow.webContents.send("camera:liveViewStopped");
      }
    });

    camera.on("liveViewFrame", (buffer) => {
      // Convert buffer to base64 for IPC
      const base64 = buffer.toString("base64");
      if (mainWindow) {
        mainWindow.webContents.send("camera:liveViewFrame", base64);
      }
    });

    await camera.initialize();

    return camera;
  } catch (error) {
    console.error("❌ Failed to initialize camera:", error.message);
    // Don't throw - app can still work in mock mode or without camera
    return null;
  }
}

/**
 * Update tray status text
 */
function updateTrayStatus(status) {
  if (tray) {
    tray.setToolTip(`Photonic - ${status}`);
  }
}

/**
 * Set up IPC handlers
 */
function setupIPCHandlers() {
  // Camera IPC handlers
  ipcMain.handle("camera:status", async () => {
    if (!camera) return { connected: false, error: "Camera not initialized" };
    return await camera.getStatus();
  });

  ipcMain.handle("camera:startLiveView", async () => {
    if (!camera) throw new Error("Camera not initialized");
    return await camera.startLiveView();
  });

  ipcMain.handle("camera:stopLiveView", async () => {
    if (!camera) throw new Error("Camera not initialized");
    return await camera.stopLiveView();
  });

  ipcMain.handle("camera:capture", async (event, photoNumber) => {
    if (!camera) throw new Error("Camera not initialized");
    return await camera.capturePhoto(photoNumber);
  });

  ipcMain.handle("camera:reconnect", async () => {
    if (!camera) throw new Error("Camera not initialized");
    return await camera.connect();
  });

  ipcMain.handle("camera:setProperty", async (event, propertyId, value) => {
    if (!camera) throw new Error("Camera not initialized");
    return await camera.setProperty(propertyId, value);
  });

  ipcMain.handle("camera:getProperty", async (event, propertyId) => {
    if (!camera) throw new Error("Camera not initialized");
    return await camera.getProperty(propertyId);
  });

  // App IPC handlers
  ipcMain.handle("app:show", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  ipcMain.handle("app:hide", () => {
    if (mainWindow) {
      mainWindow.hide();
    }
  });

  ipcMain.handle("app:restart", () => {
    app.relaunch();
    app.quit();
  });

  ipcMain.handle("app:quit", () => {
    isQuitting = true;
    app.quit();
  });

  // Backend API info
  ipcMain.handle("app:getApiUrl", () => {
    return `http://localhost:${CONFIG.backendPort}`;
  });

  // Config
  ipcMain.handle("app:getConfig", () => {
    return CONFIG;
  });
}

/**
 * App ready event
 */
app.whenReady().then(async () => {
  console.log("🚀 Photonic Electron app starting...");

  try {
    // Create main window
    createMainWindow();

    // Create tray
    createTray();

    // Initialize backend
    await initBackend();

    // Initialize camera
    await initCamera();

    // Set up IPC handlers
    setupIPCHandlers();

    console.log("✅ Photonic ready");

    // Auto-start camera if configured
    if (CONFIG.autoStart && camera && !camera.isConnected) {
      try {
        await camera.connect();
      } catch (error) {
        console.error("Auto-connect failed:", error.message);
      }
    }
  } catch (error) {
    console.error("Failed to initialize app:", error);
  }
});

/**
 * App window-all-closed event
 */
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

/**
 * App activate event (macOS)
 */
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createMainWindow();
  }
});

/**
 * App before-quit event
 */
app.on("before-quit", async (event) => {
  isQuitting = true;

  console.log("Shutting down...");

  // Shutdown camera
  if (camera) {
    try {
      await camera.shutdown();
    } catch (error) {
      console.error("Camera shutdown error:", error);
    }
  }

  // Stop backend
  if (backend) {
    try {
      await backend.close();
    } catch (error) {
      console.error("Backend shutdown error:", error);
    }
  }
});

/**
 * App second-instance event (prevent multiple instances)
 */
app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

console.log("📦 Electron main process loaded");

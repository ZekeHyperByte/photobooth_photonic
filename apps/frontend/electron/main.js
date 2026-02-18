/**
 * Photonic Kiosk - Electron Main Process
 *
 * This file runs the backend API server and serves the frontend UI
 * as a single integrated application.
 */

import { app, BrowserWindow, ipcMain, screen } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import backend
const { startServer, stopServer } = require("@photonic/backend");

let mainWindow = null;
let backendStarted = false;

// Development mode detection
const isDev = process.env.NODE_ENV === "development";

async function startBackend() {
  try {
    console.log("[Main] Starting backend server...");
    await startServer({
      port: 0, // Let OS assign available port
      host: "127.0.0.1",
    });
    backendStarted = true;
    console.log("[Main] Backend server started successfully");
  } catch (error) {
    console.error("[Main] Failed to start backend:", error);
    throw error;
  }
}

async function stopBackend() {
  if (backendStarted) {
    try {
      console.log("[Main] Stopping backend server...");
      await stopServer();
      backendStarted = false;
      console.log("[Main] Backend server stopped");
    } catch (error) {
      console.error("[Main] Error stopping backend:", error);
    }
  }
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: width,
    height: height,
    fullscreen: true,
    kiosk: true,
    frame: false,
    alwaysOnTop: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
    show: false, // Don't show until ready
  });

  // Load frontend
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  // Show window when ready
  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // Handle window closed
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // Prevent external navigation
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith("file://") && !url.startsWith("http://localhost")) {
      event.preventDefault();
    }
  });

  // Block new windows
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
}

// App event handlers
app.whenReady().then(async () => {
  try {
    // Start backend first
    await startBackend();

    // Then create window
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error) {
    console.error("[Main] Failed to initialize:", error);
    app.quit();
  }
});

app.on("window-all-closed", async () => {
  await stopBackend();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async (event) => {
  event.preventDefault();
  await stopBackend();
  app.exit(0);
});

// IPC handlers for frontend <-> backend communication
ipcMain.handle("camera:capture", async (event, sessionId, sequence) => {
  try {
    const { getCameraService } = require("@photonic/backend");
    const cameraService = getCameraService();
    return await cameraService.capturePhoto(sessionId, sequence);
  } catch (error) {
    console.error("[IPC] Capture error:", error);
    throw error;
  }
});

ipcMain.handle("camera:getStatus", async () => {
  try {
    const { getCameraService } = require("@photonic/backend");
    const cameraService = getCameraService();
    return await cameraService.getStatus();
  } catch (error) {
    console.error("[IPC] Get status error:", error);
    throw error;
  }
});

ipcMain.handle("app:quit", () => {
  app.quit();
});

// Security: Prevent new window creation
app.on("web-contents-created", (event, contents) => {
  contents.on("new-window", (event, navigationUrl) => {
    event.preventDefault();
  });
});

console.log("[Main] Electron main process initialized");

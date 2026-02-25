/**
 * Photonic Kiosk - Preload Script
 *
 * Secure bridge between frontend (renderer) and backend (main process)
 * All IPC communication goes through contextBridge to maintain security isolation
 */

import { contextBridge, ipcRenderer } from "electron";

/**
 * Camera IPC handlers
 */
const cameraHandlers = {
  capture: (sessionId, sequence) =>
    ipcRenderer.invoke("camera:capture", sessionId, sequence),
  getStatus: () => ipcRenderer.invoke("camera:getStatus"),
};

/**
 * Live view IPC handlers
 * Handles starting/stopping live view and receiving frame data
 */
const liveViewHandlers = {
  start: () => ipcRenderer.invoke("camera:liveview:start"),
  stop: () => ipcRenderer.invoke("camera:liveview:stop"),
  getTransportMode: () => ipcRenderer.invoke("camera:liveview:getTransport"),

  /**
   * Subscribe to live view frame updates
   * @param {Function} callback - Function called with base64-encoded JPEG frame
   * @returns {Function} Unsubscribe function to clean up listener
   */
  onFrame: (callback) => {
    const handler = (_event, base64Frame) => callback(base64Frame);
    ipcRenderer.on("camera:liveview:frame", handler);

    // Return unsubscribe function
    return () => {
      ipcRenderer.removeListener("camera:liveview:frame", handler);
    };
  },
};

/**
 * App IPC handlers
 */
const appHandlers = {
  quit: () => ipcRenderer.invoke("app:quit"),
};

// Expose protected methods to renderer process via contextBridge
contextBridge.exposeInMainWorld("electronAPI", {
  // Camera operations
  camera: cameraHandlers,

  // Live view operations
  liveView: liveViewHandlers,

  // App operations
  app: appHandlers,

  // Platform info
  platform: process.platform,
});

console.log("[Preload] Electron API exposed to window");
console.log("[Preload] Available APIs: camera, liveView, app, platform");

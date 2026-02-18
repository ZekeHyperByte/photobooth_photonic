/**
 * Photonic Kiosk - Preload Script
 *
 * Secure bridge between frontend (renderer) and backend (main process)
 */

import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Camera operations
  camera: {
    capture: (sessionId, sequence) =>
      ipcRenderer.invoke("camera:capture", sessionId, sequence),
    getStatus: () => ipcRenderer.invoke("camera:getStatus"),
  },

  // App operations
  app: {
    quit: () => ipcRenderer.invoke("app:quit"),
  },

  // Platform info
  platform: process.platform,
});

console.log("[Preload] Electron API exposed to window");

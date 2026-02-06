/**
 * Electron Preload Script
 * Secure bridge between main process and renderer
 */

const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  // Camera API
  camera: {
    getStatus: () => ipcRenderer.invoke("camera:status"),
    startLiveView: () => ipcRenderer.invoke("camera:startLiveView"),
    stopLiveView: () => ipcRenderer.invoke("camera:stopLiveView"),
    capture: (photoNumber) => ipcRenderer.invoke("camera:capture", photoNumber),
    reconnect: () => ipcRenderer.invoke("camera:reconnect"),
    setProperty: (propertyId, value) =>
      ipcRenderer.invoke("camera:setProperty", propertyId, value),
    getProperty: (propertyId) =>
      ipcRenderer.invoke("camera:getProperty", propertyId),

    // Event listeners
    onConnected: (callback) => ipcRenderer.on("camera:connected", callback),
    onDisconnected: (callback) =>
      ipcRenderer.on("camera:disconnected", callback),
    onCaptureStart: (callback) =>
      ipcRenderer.on("camera:captureStart", callback),
    onCaptureComplete: (callback) =>
      ipcRenderer.on("camera:captureComplete", callback),
    onCaptureError: (callback) =>
      ipcRenderer.on("camera:captureError", callback),
    onLiveViewStarted: (callback) =>
      ipcRenderer.on("camera:liveViewStarted", callback),
    onLiveViewStopped: (callback) =>
      ipcRenderer.on("camera:liveViewStopped", callback),
    onLiveViewFrame: (callback) =>
      ipcRenderer.on("camera:liveViewFrame", callback),

    // Remove listeners
    removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  },

  // App API
  app: {
    show: () => ipcRenderer.invoke("app:show"),
    hide: () => ipcRenderer.invoke("app:hide"),
    restart: () => ipcRenderer.invoke("app:restart"),
    quit: () => ipcRenderer.invoke("app:quit"),
    getApiUrl: () => ipcRenderer.invoke("app:getApiUrl"),
    getConfig: () => ipcRenderer.invoke("app:getConfig"),
  },
});

console.log("🔌 Preload script loaded");

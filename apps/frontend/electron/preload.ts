import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  // Printer operations
  print: (imagePath: string, copies: number = 1): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('print', { imagePath, copies }),

  // File system operations
  saveFile: (imagePath: string, defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('save-file', { imagePath, defaultPath }),

  // App control
  exitKiosk: (): Promise<void> =>
    ipcRenderer.invoke('exit-kiosk'),

  restartApp: (): Promise<void> =>
    ipcRenderer.invoke('restart-app'),

  // System info
  getSystemInfo: (): Promise<{ platform: string; version: string }> =>
    ipcRenderer.invoke('get-system-info'),
});

// Type definitions for window.electron
export interface ElectronAPI {
  print: (imagePath: string, copies: number) => Promise<{ success: boolean; error?: string }>;
  saveFile: (imagePath: string, defaultPath: string) => Promise<string | null>;
  exitKiosk: () => Promise<void>;
  restartApp: () => Promise<void>;
  getSystemInfo: () => Promise<{ platform: string; version: string }>;
}

declare global {
  interface Window {
    electron?: ElectronAPI;
  }
}

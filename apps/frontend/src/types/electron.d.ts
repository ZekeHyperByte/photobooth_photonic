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

export {};

import { ipcMain, BrowserWindow } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export function registerPrinterHandlers() {
  ipcMain.handle('print', async (event, { imagePath, copies = 1, paperSize = 'A4' }) => {
    try {
      // Validate file exists
      if (!fs.existsSync(imagePath)) {
        return {
          success: false,
          error: 'Image file not found'
        };
      }

      // Get available printers
      const window = BrowserWindow.fromWebContents(event.sender);
      if (!window) {
        return {
          success: false,
          error: 'Window not found'
        };
      }

      const printers = await window.webContents.getPrintersAsync();

      if (printers.length === 0) {
        return {
          success: false,
          error: 'No printers found'
        };
      }

      // Platform-specific printing
      if (process.platform === 'win32') {
        // Windows: use mspaint to print
        // Note: This opens print dialog. For silent printing, use different approach
        // Windows mspaint doesn't support paper size via command line
        // Consider using a dedicated printing library for production
        await execAsync(`mspaint /pt "${imagePath}"`);
      } else if (process.platform === 'linux') {
        // Linux: use lp command with media option
        const mediaOption = paperSize === 'A3' ? '-o media=A3' : '-o media=A4';
        for (let i = 0; i < copies; i++) {
          await execAsync(`lp ${mediaOption} "${imagePath}"`);
        }
      } else if (process.platform === 'darwin') {
        // macOS: use lpr command with media option
        // A3 dimensions: 297x420mm, A4: 210x297mm
        const mediaOption = paperSize === 'A3'
          ? '-o media=iso_a3_297x420mm'
          : '-o media=iso_a4_210x297mm';
        for (let i = 0; i < copies; i++) {
          await execAsync(`lpr ${mediaOption} "${imagePath}"`);
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Print error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Print failed'
      };
    }
  });
}

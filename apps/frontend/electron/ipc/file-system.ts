import { ipcMain, dialog } from 'electron';
import fs from 'fs';
import path from 'path';

export function registerFileSystemHandlers() {
  ipcMain.handle('save-file', async (event, { imagePath, defaultPath }) => {
    try {
      // Validate file exists
      if (!fs.existsSync(imagePath)) {
        return null;
      }

      // Show save dialog
      const result = await dialog.showSaveDialog({
        defaultPath: defaultPath || path.basename(imagePath),
        filters: [
          { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] },
          { name: 'All Files', extensions: ['*'] }
        ],
      });

      // If user canceled, return null
      if (result.canceled || !result.filePath) {
        return null;
      }

      // Copy file to selected location
      fs.copyFileSync(imagePath, result.filePath);

      return result.filePath;
    } catch (error) {
      console.error('Save file error:', error);
      return null;
    }
  });
}

import { ipcMain, app, BrowserWindow } from 'electron';

export function registerAppControlHandlers(mainWindow: BrowserWindow | null) {
  ipcMain.handle('exit-kiosk', async () => {
    try {
      if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
      }
    } catch (error) {
      console.error('Exit kiosk error:', error);
    }
  });

  ipcMain.handle('restart-app', async () => {
    try {
      app.relaunch();
      app.quit();
    } catch (error) {
      console.error('Restart app error:', error);
    }
  });

  ipcMain.handle('get-system-info', async () => {
    return {
      platform: process.platform,
      version: app.getVersion(),
    };
  });
}

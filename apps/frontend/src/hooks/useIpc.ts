export const useIpc = () => {
  const print = async (imagePath: string, copies: number = 1) => {
    if (!window.electron) {
      throw new Error('Electron IPC not available. Running in browser mode.');
    }
    return window.electron.print(imagePath, copies);
  };

  const saveFile = async (imagePath: string, defaultPath: string) => {
    if (!window.electron) {
      throw new Error('Electron IPC not available. Running in browser mode.');
    }
    return window.electron.saveFile(imagePath, defaultPath);
  };

  const exitKiosk = async () => {
    if (!window.electron) {
      console.warn('Electron IPC not available. Cannot exit kiosk mode.');
      return;
    }
    return window.electron.exitKiosk();
  };

  const restartApp = async () => {
    if (!window.electron) {
      console.warn('Electron IPC not available. Cannot restart app.');
      return;
    }
    return window.electron.restartApp();
  };

  const getSystemInfo = async () => {
    if (!window.electron) {
      return { platform: 'web', version: '0.1.0' };
    }
    return window.electron.getSystemInfo();
  };

  return {
    print,
    saveFile,
    exitKiosk,
    restartApp,
    getSystemInfo,
    isElectron: !!window.electron,
  };
};

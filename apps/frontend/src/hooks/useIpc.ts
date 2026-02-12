import { deliveryService } from '../services/deliveryService';

export const useIpc = () => {
  const print = async (photoId: string, copies: number = 1) => {
    return deliveryService.queuePrint(photoId, copies);
  };

  const saveFile = async () => null;

  const exitKiosk = async () => {
    console.warn('exitKiosk: use systemctl or kill chromium');
  };

  const restartApp = async () => {
    window.location.reload();
  };

  const getSystemInfo = async () => {
    return { platform: 'linux', version: '0.1.0' };
  };

  return { print, saveFile, exitKiosk, restartApp, getSystemInfo, isElectron: false };
};

import { ipcMain } from 'electron';

import { getConnectivityStatus } from '../services/connectivity';

export function registerConnectivityHandlers(): void {
  ipcMain.handle('connectivity:get', () => getConnectivityStatus());
}

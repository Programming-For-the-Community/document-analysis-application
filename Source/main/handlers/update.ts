import { ipcMain } from 'electron';

import { getUpdateState, installUpdate } from '../services/updater';
import { Logger } from '../../utils/logger';

export function registerUpdateHandlers(): void {
  ipcMain.handle('update:get-status', () => getUpdateState());

  ipcMain.handle('update:install', async () => {
    Logger.info('IPC update:install requested');
    await installUpdate();
  });
}

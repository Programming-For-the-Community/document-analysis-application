import { ipcMain, BrowserWindow } from 'electron';
import path from 'node:path';

import { Logger } from '../../utils/logger';

export function registerNavHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle('nav:open-project', (_event, project: { id: string; name: string }) => {
    Logger.info(`Navigating to project: "${project.name}" (${project.id})`);
    void getWindow()?.loadFile(path.join(__dirname, '../../../renderer/project/index.html'), {
      query: { id: project.id, name: project.name },
    });
  });

  ipcMain.handle('nav:go-home', () => {
    Logger.info('Navigating back to home');
    void getWindow()?.loadFile(path.join(__dirname, '../../../renderer/home/index.html'));
  });
}

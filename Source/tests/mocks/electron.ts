// Stand-in for the `electron` module (aliased in vitest.config.mjs). IPC handlers
// registered through ipcMain.handle are captured so tests can call them with invoke().
import os from 'node:os';
import { vi } from 'vitest';

type IpcHandler = (event: unknown, ...args: unknown[]) => unknown;

const handlers = new Map<string, IpcHandler>();

export const webContents = { send: vi.fn() };
export const mainWindow = { webContents, loadFile: vi.fn() };

export const ipcMain = { handle: vi.fn() };
export const BrowserWindow = Object.assign(vi.fn(), {
  getAllWindows: vi.fn(),
  fromWebContents: vi.fn(),
});
export const app = {
  isPackaged: false,
  getPath: vi.fn(),
  getVersion: vi.fn(),
  getAppPath: vi.fn(),
  quit: vi.fn(),
};
export const dialog = { showOpenDialog: vi.fn() };
export const shell = { openPath: vi.fn(), showItemInFolder: vi.fn() };

// Called before every test (tests/setup.ts) — restoreMocks wipes implementations.
export function resetElectronMock(): void {
  handlers.clear();
  ipcMain.handle.mockImplementation((channel: string, fn: IpcHandler) => {
    handlers.set(channel, fn);
  });
  BrowserWindow.mockImplementation(() => mainWindow);
  BrowserWindow.getAllWindows.mockReturnValue([mainWindow]);
  BrowserWindow.fromWebContents.mockReturnValue(mainWindow);
  app.isPackaged = false;
  app.getPath.mockReturnValue(os.tmpdir());
  app.getVersion.mockReturnValue('1.0.0');
  app.getAppPath.mockReturnValue('/app/Source');
  dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
  shell.openPath.mockResolvedValue('');
}

export async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`No IPC handler registered for "${channel}"`);
  return (await fn({ sender: {} }, ...args)) as T;
}

// Messages pushed to the renderer on a channel, in order.
export function sentOn(channel: string): unknown[] {
  return webContents.send.mock.calls.filter(([c]) => c === channel).map(([, data]) => data);
}

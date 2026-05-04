import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  auth: {
    start: (credentials: {
      username: string;
      password: string;
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('auth:start', credentials),
    signup: (credentials: {
      username: string;
      password: string;
    }): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('auth:signup', credentials),
    getTokens: (): Promise<{
      accessToken: string;
      idToken: string;
      refreshToken: string;
    } | null> => ipcRenderer.invoke('auth:get-tokens'),
    logout: (): Promise<void> => ipcRenderer.invoke('auth:logout'),
  },
  config: {
    get: (): Promise<Record<string, string>> => ipcRenderer.invoke('config:get'),
  },
});

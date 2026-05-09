import { contextBridge, ipcRenderer, webUtils } from 'electron';

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
  nav: {
    openProject: (project: { id: string; name: string }): Promise<void> =>
      ipcRenderer.invoke('nav:open-project', project),
    goHome: (): Promise<void> => ipcRenderer.invoke('nav:go-home'),
  },
  projects: {
    list: (): Promise<{ success: boolean; projects?: { id: string; name: string; documentCount: number; lastModified: string }[]; error?: string }> =>
      ipcRenderer.invoke('project:list'),
    create: (projectName: string): Promise<{ success: boolean; project?: { id: string; name: string; documentCount: number; lastModified: string }; error?: string }> =>
      ipcRenderer.invoke('project:create', projectName),
    rename: (projectId: string, newName: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('project:rename', projectId, newName),
    delete: (projectId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('project:delete', projectId),
  },
  documents: {
    selectFiles: () => ipcRenderer.invoke('document:select-files'),
    selectFolder: () => ipcRenderer.invoke('document:select-folder'),
    upload: (
      projectId: string,
      files: Array<{ name: string; path: string; size: number }>
    ) => ipcRenderer.invoke('document:upload', projectId, files),
    list: (projectId: string) => ipcRenderer.invoke('document:list', projectId),
  },
  utils: {
    getFilePath: (file: File): string => webUtils.getPathForFile(file),
  },
});
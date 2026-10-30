import { contextBridge, ipcRenderer, webUtils } from 'electron';

import { ConnectivityStatus } from '../interfaces/connectivity';
import { EntityConnection } from '../interfaces/graph';
import { MemberRole } from '../types/app';
import { UpdateState } from '../interfaces/update';

// Registers an IPC listener and returns a function that removes it, so React
// effects can clean up instead of stacking a new listener on every re-run.
function subscribe<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload as T);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

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
  connectivity: {
    get: (): Promise<ConnectivityStatus> => ipcRenderer.invoke('connectivity:get'),
    onStatusUpdate: (callback: (status: ConnectivityStatus) => void) =>
      subscribe('connectivity:status-update', callback),
  },
  nav: {
    openProject: (project: { id: string; name: string }): Promise<void> =>
      ipcRenderer.invoke('nav:open-project', project),
    goHome: (): Promise<void> => ipcRenderer.invoke('nav:go-home'),
  },
  projects: {
    list: (): Promise<{
      success: boolean;
      projects?: {
        id: string;
        name: string;
        documentCount: number;
        lastModified: string;
        role: string;
      }[];
      error?: string;
    }> => ipcRenderer.invoke('project:list'),
    create: (
      projectName: string
    ): Promise<{
      success: boolean;
      project?: {
        id: string;
        name: string;
        documentCount: number;
        lastModified: string;
        role: string;
      };
      error?: string;
    }> => ipcRenderer.invoke('project:create', projectName),
    rename: (projectId: string, newName: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('project:rename', projectId, newName),
    delete: (projectId: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('project:delete', projectId),
    getRole: (projectId: string): Promise<{ success: boolean; role?: string; error?: string }> =>
      ipcRenderer.invoke('project:get-role', projectId),
    share: (
      projectId: string,
      username: string,
      role: MemberRole
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('project:share', projectId, username, role),
    unshare: (
      projectId: string,
      targetSub: string
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('project:unshare', projectId, targetSub),
    listMembers: (
      projectId: string
    ): Promise<{
      success: boolean;
      members?: { userSub: string; username: string; role: string }[];
      error?: string;
    }> => ipcRenderer.invoke('project:list-members', projectId),
    updateRole: (
      projectId: string,
      targetSub: string,
      newRole: MemberRole
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('project:update-role', projectId, targetSub, newRole),
    searchUsers: (
      prefix: string
    ): Promise<{ success: boolean; usernames?: string[]; error?: string }> =>
      ipcRenderer.invoke('project:search-users', prefix),
    getSettings: (
      projectId: string
    ): Promise<{ success: boolean; minDocFilter?: number; error?: string }> =>
      ipcRenderer.invoke('project:get-settings', projectId),
    setMinDocFilter: (
      projectId: string,
      minDocFilter: number
    ): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('project:set-min-doc-filter', projectId, minDocFilter),
  },
  documents: {
    selectFiles: () => ipcRenderer.invoke('document:select-files'),
    selectFolder: () => ipcRenderer.invoke('document:select-folder'),
    upload: (projectId: string, files: Array<{ name: string; path: string; size: number }>) =>
      ipcRenderer.invoke('document:upload', projectId, files),
    list: (projectId: string) => ipcRenderer.invoke('document:list', projectId),
    delete: (projectId: string, documentId: string) =>
      ipcRenderer.invoke('document:delete', projectId, documentId),
    getText: (projectId: string, documentId: string) =>
      ipcRenderer.invoke('document:get-text', projectId, documentId),
    retryGraph: (projectId: string, documentId: string) =>
      ipcRenderer.invoke('document:retry-graph', projectId, documentId),
    onStatusUpdate: (
      callback: (update: { projectId: string; documentId: string; status: string }) => void
    ) => subscribe('document:status-update', callback),
    onDocumentAdded: (callback: (doc: unknown) => void) => subscribe('document:added', callback),
    onDocumentRemoved: (callback: (data: { projectId: string; documentId: string }) => void) =>
      subscribe('document:removed', callback),
  },
  search: {
    query: (
      projectId: string,
      query: string
    ): Promise<{
      success: boolean;
      answer?: string;
      citations?: Array<{ documentName: string; excerpt: string; score: number }>;
      error?: string;
    }> => ipcRenderer.invoke('search:query', projectId, query),
  },
  graph: {
    syncProject: (
      projectId: string
    ): Promise<{
      success: boolean;
      loaded?: number;
      failed?: number;
      total?: number;
      error?: string;
    }> => ipcRenderer.invoke('graph:sync-project', projectId),
    getProjectGraph: (
      projectId: string,
      minDocCount: number
    ): Promise<{
      success: boolean;
      nodes?: Array<{ data: { id: string; label: string; type: string; docCount: number } }>;
      edges?: Array<{ data: { id: string; source: string; target: string; label: string } }>;
      error?: string;
    }> => ipcRenderer.invoke('graph:get-project-graph', projectId, minDocCount),
    getNodeDetail: (
      projectId: string,
      entityName: string,
      entityType: string
    ): Promise<{
      success: boolean;
      connections?: EntityConnection[];
      documents?: Array<{ documentId: string; documentName: string }>;
      error?: string;
    }> => ipcRenderer.invoke('graph:get-node-detail', projectId, entityName, entityType),
  },
  preferences: {
    getTheme: (): Promise<{ success: boolean; value?: string | null; error?: string }> =>
      ipcRenderer.invoke('user:get-preference', 'theme_preference'),
    setTheme: (theme: string): Promise<{ success: boolean; error?: string }> =>
      ipcRenderer.invoke('user:set-preference', 'theme_preference', theme),
  },
  updates: {
    getStatus: (): Promise<UpdateState> => ipcRenderer.invoke('update:get-status'),
    install: (): Promise<void> => ipcRenderer.invoke('update:install'),
    onStatus: (callback: (state: UpdateState) => void) => subscribe('update:status', callback),
  },
  utils: {
    // Dropped File objects no longer expose a `.path` property in the renderer
    // (removed for sandboxing); webUtils.getPathForFile is the replacement API.
    getFilePath: (file: File): string => webUtils.getPathForFile(file),
  },
});

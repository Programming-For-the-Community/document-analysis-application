// Fake `window.electron` (the preload bridge) for renderer handler/hook tests.
// Every method is a vi.fn(); the on* subscriptions record their callbacks so a
// test can push an event with emit() and check that unsubscribing works.
import { vi } from 'vitest';

type Listener = (data: never) => void;

const listeners = new Map<string, Set<Listener>>();

function subscription(channel: string) {
  return vi.fn((callback: Listener) => {
    const set = listeners.get(channel) ?? new Set<Listener>();
    set.add(callback);
    listeners.set(channel, set);
    return () => set.delete(callback);
  });
}

export function emit(channel: string, data: unknown): void {
  for (const callback of listeners.get(channel) ?? []) (callback as (d: unknown) => void)(data);
}

export function listenerCount(channel: string): number {
  return listeners.get(channel)?.size ?? 0;
}

export function installElectronApi() {
  listeners.clear();
  const api = {
    auth: { start: vi.fn(), signup: vi.fn(), getTokens: vi.fn(), logout: vi.fn() },
    config: { get: vi.fn() },
    connectivity: {
      get: vi.fn().mockResolvedValue({ neo4j: 'disconnected', qdrant: 'disconnected' }),
      onStatusUpdate: subscription('connectivity'),
    },
    nav: { openProject: vi.fn(), goHome: vi.fn() },
    projects: {
      list: vi.fn(),
      create: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      getRole: vi.fn(),
      share: vi.fn(),
      unshare: vi.fn(),
      listMembers: vi.fn(),
      updateRole: vi.fn(),
      searchUsers: vi.fn(),
      getSettings: vi.fn(),
      setMinDocFilter: vi.fn(),
    },
    documents: {
      selectFiles: vi.fn(),
      selectFolder: vi.fn(),
      upload: vi.fn(),
      list: vi.fn(),
      delete: vi.fn(),
      getText: vi.fn(),
      retryGraph: vi.fn(),
      onStatusUpdate: subscription('document:status'),
      onDocumentAdded: subscription('document:added'),
      onDocumentRemoved: subscription('document:removed'),
    },
    search: { query: vi.fn() },
    graph: { syncProject: vi.fn(), getProjectGraph: vi.fn(), getNodeDetail: vi.fn() },
    preferences: { getTheme: vi.fn(), setTheme: vi.fn() },
    updates: { getStatus: vi.fn(), install: vi.fn(), onStatus: subscription('update') },
    utils: { getFilePath: vi.fn() },
  };
  (window as unknown as { electron: typeof api }).electron = api;
  return api;
}

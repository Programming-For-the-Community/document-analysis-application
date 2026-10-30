import { beforeEach, vi } from 'vitest';

import { resetElectronMock } from './mocks/electron';

// Silenced for every test file; tests/utils/logger.test.ts unmocks it to test it.
vi.mock('../utils/logger', () => ({
  Logger: {
    init: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    setLevel: vi.fn(),
  },
}));

// Node 25+ ships its own global localStorage, which takes precedence over the DOM
// environment's and is non-functional without --localstorage-file. Renderer tests
// get a working in-memory Storage instead.
class MemoryStorage {
  private readonly items = new Map<string, string>();
  get length(): number {
    return this.items.size;
  }
  key(index: number): string | null {
    return [...this.items.keys()][index] ?? null;
  }
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, String(value));
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
  clear(): void {
    this.items.clear();
  }
}

if (typeof document !== 'undefined' && typeof globalThis.localStorage?.clear !== 'function') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

beforeEach(() => {
  resetElectronMock();
});

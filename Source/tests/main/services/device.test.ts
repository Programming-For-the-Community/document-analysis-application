import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let userData: string;

// device.ts caches the id in module state, so each test loads a fresh copy (which
// also reloads the electron mock, so the fresh copy is pointed at userData)
async function loadGetDeviceId() {
  vi.resetModules();
  const electron = await import('../../mocks/electron');
  electron.resetElectronMock();
  electron.app.getPath.mockReturnValue(userData);
  return (await import('../../../main/services/device')).getDeviceId;
}

describe('getDeviceId', () => {
  beforeEach(() => {
    userData = fs.mkdtempSync(path.join(os.tmpdir(), 'device-test-'));
  });

  afterEach(() => {
    fs.rmSync(userData, { recursive: true, force: true });
  });

  it('generates and persists an id on first run, then caches it', async () => {
    const getDeviceId = await loadGetDeviceId();

    const id = getDeviceId();

    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(fs.readFileSync(path.join(userData, 'device.json'), 'utf-8'))).toEqual({
      deviceId: id,
    });
    fs.rmSync(path.join(userData, 'device.json'));
    expect(getDeviceId()).toBe(id);
  });

  it('reuses a persisted id', async () => {
    fs.writeFileSync(path.join(userData, 'device.json'), JSON.stringify({ deviceId: 'existing' }));
    const getDeviceId = await loadGetDeviceId();
    expect(getDeviceId()).toBe('existing');
  });

  it('replaces an unreadable device file', async () => {
    fs.writeFileSync(path.join(userData, 'device.json'), 'not json');
    const getDeviceId = await loadGetDeviceId();
    expect(getDeviceId()).not.toBe('not json');
  });
});

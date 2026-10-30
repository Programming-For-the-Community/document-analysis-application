import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SecretValues } from '../../../interfaces/aws';
import { setPlatform } from '../../helpers';

vi.mock('child_process', () => ({ execFileSync: vi.fn(), spawn: vi.fn() }));

class FakeProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
}

// docker-manager caches the resolved docker binary in module state, so each
// test loads a fresh copy (along with fresh electron/secrets mocks it sees).
async function load(existing: string[] = []) {
  vi.resetModules();
  const electron = await import('../../mocks/electron');
  electron.resetElectronMock();
  const childProcess = await import('child_process');
  const { AWS_SECRETS } = await import('../../../classes/aws/secrets');
  vi.spyOn(AWS_SECRETS, 'secrets', 'get').mockReturnValue({
    SVC_PWD: 'neo-pw',
    QDRANT_KEY: 'q-key',
  } as SecretValues);
  vi.spyOn(fs, 'existsSync').mockImplementation((p) => existing.includes(String(p)));
  const mod = await import('../../../main/services/docker-manager');
  return {
    ...mod,
    electron,
    execFileSync: vi.mocked(childProcess.execFileSync),
    spawn: vi.mocked(childProcess.spawn),
  };
}

// Makes the next spawn() emit the given output and exit code
function nextSpawn(
  spawn: Awaited<ReturnType<typeof load>>['spawn'],
  exit: { code?: number; error?: Error; output?: string }
) {
  const proc = new FakeProcess();
  spawn.mockImplementationOnce(() => {
    setImmediate(() => {
      if (exit.output) {
        proc.stdout.emit('data', Buffer.from(exit.output));
        proc.stderr.emit('data', Buffer.from(' (stderr)'));
      }
      if (exit.error) proc.emit('error', exit.error);
      else proc.emit('close', exit.code ?? 0);
    });
    return proc as never;
  });
}

describe('docker manager', () => {
  let restorePlatform: () => void;

  beforeEach(() => {
    restorePlatform = setPlatform('linux');
  });

  afterEach(() => {
    restorePlatform();
  });

  describe('resolveDataPath', () => {
    it('uses the D: drive on dev machines', async () => {
      const { resolveDataPath } = await load(['D:/']);
      expect(resolveDataPath()).toBe('D:/Projects/.data/doc-analysis');
    });

    it('falls back to ProgramData', async () => {
      const { resolveDataPath } = await load();
      expect(resolveDataPath()).toBe('C:/ProgramData/doc-analysis');
    });
  });

  it('refuses to start when the Docker daemon is not running', async () => {
    const { DockerManager, execFileSync, spawn } = await load();
    execFileSync.mockImplementation(() => {
      throw new Error('Cannot connect to the Docker daemon');
    });

    await expect(new DockerManager().start()).rejects.toThrow('Docker is not running');
    expect(spawn).not.toHaveBeenCalled();
  });

  it('runs compose up from the repo in dev, passing secrets through the environment', async () => {
    const { DockerManager, execFileSync, spawn } = await load(['/usr/bin/docker']);
    nextSpawn(spawn, { code: 0 });

    await new DockerManager().start();

    expect(execFileSync).toHaveBeenCalledWith('/usr/bin/docker', ['info'], { stdio: 'ignore' });
    const [binary, args, options] = spawn.mock.calls[0]!;
    expect(binary).toBe('/usr/bin/docker');
    expect(args).toEqual([
      'compose',
      '-p',
      'doc-analysis',
      '-f',
      path.join('/app/Source', '..', 'docker-compose.yml'),
      'up',
      '-d',
    ]);
    expect((options as { env: NodeJS.ProcessEnv }).env).toMatchObject({
      NEO4J_PASSWORD: 'neo-pw',
      QDRANT_API_KEY: 'q-key',
      DATA_PATH: 'C:/ProgramData/doc-analysis',
    });
  });

  it('uses the bundled compose file when packaged and falls back to docker on PATH', async () => {
    const { DockerManager, electron, spawn } = await load();
    electron.app.isPackaged = true;
    Object.defineProperty(process, 'resourcesPath', {
      value: '/opt/app/resources',
      configurable: true,
    });
    nextSpawn(spawn, { code: 0 });

    await new DockerManager().start();

    const [binary, args] = spawn.mock.calls[0]!;
    expect(binary).toBe('docker');
    expect(args).toContain(path.join('/opt/app/resources', 'docker-compose.yml'));
  });

  it('includes compose output when compose up fails', async () => {
    const { DockerManager, spawn } = await load();
    nextSpawn(spawn, { code: 1, output: 'port 7687 already allocated' });

    await expect(new DockerManager().start()).rejects.toThrow(
      'docker compose up failed (exit 1):\n\nport 7687 already allocated (stderr)'
    );
  });

  it('explains a docker binary that cannot be spawned', async () => {
    const { DockerManager, spawn } = await load();
    nextSpawn(spawn, { error: new Error('spawn docker ENOENT') });

    await expect(new DockerManager().start()).rejects.toThrow(
      'Failed to run docker compose: spawn docker ENOENT'
    );
  });

  it('stops containers only after a successful start', async () => {
    const { DockerManager, spawn } = await load();
    const manager = new DockerManager();

    await manager.stop();
    expect(spawn).not.toHaveBeenCalled();

    nextSpawn(spawn, { code: 0 });
    await manager.start();
    nextSpawn(spawn, { code: 0 });
    await manager.stop();
    expect(spawn.mock.calls[1]![1]).toContain('stop');

    // A failed stop still resolves so quitting is never blocked
    nextSpawn(spawn, { error: new Error('gone') });
    await expect(manager.stop()).resolves.toBeUndefined();
  });

  it('checks the platform install locations before PATH', async () => {
    restorePlatform();
    restorePlatform = setPlatform('darwin');
    const { DockerManager, spawn } = await load(['/opt/homebrew/bin/docker']);
    nextSpawn(spawn, { code: 0 });

    await new DockerManager().start();

    expect(spawn.mock.calls[0]![0]).toBe('/opt/homebrew/bin/docker');
  });
});

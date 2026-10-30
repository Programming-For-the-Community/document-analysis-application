import fs from 'node:fs';
import { createRequire } from 'node:module';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requireScript = createRequire(__filename);
const { readEnv, syncEnvVersion, run, ENV_PATH } = requireScript(
  '../../scripts/sync-version.js'
) as {
  readEnv: () => Record<string, string>;
  syncEnvVersion: (version: string) => boolean;
  run: (argv: string[], version: string) => number;
  ENV_PATH: string;
};

// In-memory stand-in for Source/.env so the real file is never touched
describe('sync-version', () => {
  let envFile: string | null;

  beforeEach(() => {
    envFile = null;
    vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === ENV_PATH && envFile !== null);
    vi.spyOn(fs, 'readFileSync').mockImplementation(((p: string) => {
      if (p !== ENV_PATH || envFile === null) throw new Error(`ENOENT ${p}`);
      return envFile;
    }) as typeof fs.readFileSync);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(((p: string, data: string) => {
      if (p === ENV_PATH) envFile = data;
    }) as typeof fs.writeFileSync);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('readEnv', () => {
    it('parses KEY=value lines, splitting on the first =', () => {
      envFile =
        'APP_NAME=doc-app\r\n# comment\nAPP_VERSION = 1.2.0 \nLOG_FORMAT=[%s]=%s\nlower=ignored\n\nNO_EQUALS';

      expect(readEnv()).toEqual({
        APP_NAME: 'doc-app',
        APP_VERSION: '1.2.0',
        LOG_FORMAT: '[%s]=%s',
      });
    });

    it('returns nothing when there is no .env', () => {
      expect(readEnv()).toEqual({});
    });
  });

  describe('syncEnvVersion', () => {
    it('replaces an existing APP_VERSION', () => {
      envFile = 'APP_NAME=x\nAPP_VERSION=1.0.0\nLOG_LEVEL=info\n';

      expect(syncEnvVersion('1.1.0')).toBe(true);
      expect(envFile).toBe('APP_NAME=x\nAPP_VERSION=1.1.0\nLOG_LEVEL=info\n');
    });

    it('appends APP_VERSION when missing, and creates the file if needed', () => {
      envFile = 'APP_NAME=x\n\n';
      syncEnvVersion('2.0.0');
      expect(envFile).toBe('APP_NAME=x\nAPP_VERSION=2.0.0\n');

      envFile = null;
      syncEnvVersion('2.0.0');
      expect(envFile).toBe('\nAPP_VERSION=2.0.0\n');
    });

    it('leaves a matching file untouched', () => {
      envFile = 'APP_VERSION=1.1.0\n';
      expect(syncEnvVersion('1.1.0')).toBe(false);
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('run', () => {
    beforeEach(() => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    it('--check passes only when the versions match', () => {
      envFile = 'APP_VERSION=1.1.0\n';
      expect(run(['--check'], '1.1.0')).toBe(0);
      expect(run(['--check'], '1.2.0')).toBe(1);
      expect(console.error).toHaveBeenCalledWith(
        expect.stringContaining('(1.1.0) does not match package.json (1.2.0)')
      );

      envFile = null;
      expect(run(['--check'], '1.2.0')).toBe(1);
      expect(console.error).toHaveBeenLastCalledWith(expect.stringContaining('(missing)'));
      expect(fs.writeFileSync).not.toHaveBeenCalled();
    });

    it('syncs .env otherwise', () => {
      envFile = 'APP_VERSION=1.1.0\n';
      expect(run([], '1.2.0')).toBe(0);
      expect(envFile).toBe('APP_VERSION=1.2.0\n');
      expect(console.log).toHaveBeenLastCalledWith('.env APP_VERSION set to 1.2.0');

      expect(run([], '1.2.0')).toBe(0);
      expect(console.log).toHaveBeenLastCalledWith('.env APP_VERSION already 1.2.0');
    });
  });
});

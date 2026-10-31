import fs from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReleaseManifest } from '../../../interfaces/update';
import { makeConfig, setPlatform } from '../../helpers';

vi.mock('node:child_process', () => ({ execFile: vi.fn(), spawn: vi.fn() }));

const config = makeConfig();
const manifest: ReleaseManifest = {
  version: '1.2.0',
  key: 'win/1.2.0/DocumentAnalysis-Setup-1.2.0.exe',
  sha512: 'expected-sha',
  size: 200,
  releaseDate: '2026-10-01',
  notes: 'Fixes',
};

// updater.ts holds the update state in module state (and reads the dev flag and
// the required publisher at load time), so each test loads a fresh copy.
async function load(options: { publisher?: string } = {}) {
  vi.resetModules();
  if (options.publisher !== undefined) {
    vi.doMock('../../../constants/updater', async (importOriginal) => ({
      ...(await importOriginal<object>()),
      REQUIRED_WIN_PUBLISHER: options.publisher,
    }));
  } else {
    vi.doUnmock('../../../constants/updater');
  }
  const electron = await import('../../mocks/electron');
  electron.resetElectronMock();
  electron.app.isPackaged = true;
  electron.app.getVersion.mockReturnValue('1.1.0');
  const childProcess = await import('node:child_process');
  const { AWS_S3 } = await import('../../../classes/aws/s3');
  const updater = await import('../../../main/services/updater');
  return { ...updater, electron, AWS_S3, childProcess: vi.mocked(childProcess) };
}

type Loaded = Awaited<ReturnType<typeof load>>;

function statuses(electron: Loaded['electron']): string[] {
  return electron.sentOn('update:status').map((s) => (s as { status: string }).status);
}

// Download that reports progress and leaves a file of `size` bytes behind
function stubDownload(
  AWS_S3: Loaded['AWS_S3'],
  { size = manifest.size, sha = manifest.sha512 } = {}
) {
  return vi
    .spyOn(AWS_S3, 'downloadRelease')
    .mockImplementation(async (_key, dest, _cfg, onProgress) => {
      onProgress(0);
      onProgress(100);
      onProgress(101);
      onProgress(size);
      fs.writeFileSync(dest, Buffer.alloc(size));
      return sha;
    });
}

describe('updater', () => {
  let restorePlatform: () => void;

  beforeEach(() => {
    restorePlatform = setPlatform('win32');
  });

  afterEach(() => {
    restorePlatform();
    vi.doUnmock('../../../constants/updater');
  });

  describe('checkForUpdate', () => {
    it('is skipped in dev builds', async () => {
      const { checkForUpdate, electron, AWS_S3 } = await load();
      electron.app.isPackaged = false;
      const getRelease = vi.spyOn(AWS_S3, 'getReleaseJson');

      await checkForUpdate(config);

      expect(getRelease).not.toHaveBeenCalled();
    });

    it('is skipped on platforms with no release folder', async () => {
      restorePlatform();
      restorePlatform = setPlatform('freebsd');
      const { checkForUpdate, AWS_S3 } = await load();
      const getRelease = vi.spyOn(AWS_S3, 'getReleaseJson');

      await checkForUpdate(config);

      expect(getRelease).not.toHaveBeenCalled();
    });

    it('announces a newer release to the renderer', async () => {
      const { checkForUpdate, getUpdateState, electron, AWS_S3 } = await load();
      vi.spyOn(AWS_S3, 'getReleaseJson').mockResolvedValue(manifest);

      await checkForUpdate(config);

      expect(AWS_S3.getReleaseJson).toHaveBeenCalledWith('win/latest.json', config.releases);
      expect(getUpdateState()).toEqual({ status: 'available', version: '1.2.0', notes: 'Fixes' });
      expect(statuses(electron)).toEqual(['available']);
    });

    it.each([
      ['nothing is published', null],
      ['the installed version is current', { ...manifest, version: '1.1.0' }],
    ])('stays idle when %s', async (_label, latest) => {
      const { checkForUpdate, getUpdateState, AWS_S3 } = await load();
      vi.spyOn(AWS_S3, 'getReleaseJson').mockResolvedValue(latest);

      await checkForUpdate(config);

      expect(getUpdateState()).toEqual({ status: 'idle' });
    });

    it('swallows check failures', async () => {
      const { checkForUpdate, getUpdateState, AWS_S3 } = await load();
      vi.spyOn(AWS_S3, 'getReleaseJson').mockRejectedValue(new Error('AccessDenied'));

      await expect(checkForUpdate(config)).resolves.toBeUndefined();
      expect(getUpdateState()).toEqual({ status: 'idle' });
    });
  });

  describe('installUpdate', () => {
    async function loadAvailable(options?: { publisher?: string }) {
      const loaded = await load(options);
      vi.spyOn(loaded.AWS_S3, 'getReleaseJson').mockResolvedValue(manifest);
      await loaded.checkForUpdate(config);
      loaded.childProcess.spawn.mockReturnValue({ unref: vi.fn() } as never);
      return loaded;
    }

    it('refuses when no update is available', async () => {
      const { installUpdate } = await load();
      await expect(installUpdate()).rejects.toThrow('No update available');
    });

    it('downloads, verifies and silently runs the Windows installer', async () => {
      const { installUpdate, checkForUpdate, electron, AWS_S3, childProcess } =
        await loadAvailable();
      const download = stubDownload(AWS_S3);

      await installUpdate();

      const dest = download.mock.calls[0]![1];
      expect(dest).toBe(
        path.join(
          electron.app.getPath('temp'),
          'doc-analysis-update',
          'DocumentAnalysis-Setup-1.2.0.exe'
        )
      );
      expect(childProcess.spawn).toHaveBeenCalledWith(dest, ['--updated', '/S', '--force-run'], {
        detached: true,
        stdio: 'ignore',
      });
      expect(electron.app.quit).toHaveBeenCalled();
      // 0% on start, then 50% and 100% — repeated percentages aren't re-sent
      expect(statuses(electron)).toEqual([
        'available',
        'downloading',
        'downloading',
        'downloading',
        'installing',
      ]);
      expect(electron.sentOn('update:status')[2]).toMatchObject({ percent: 50 });

      // A check while installing leaves the state alone
      await checkForUpdate(config);
      expect(statuses(electron).at(-1)).toBe('installing');
    });

    it.each([
      ['size', { size: 199 }],
      ['hash', { sha: 'tampered' }],
    ])('rejects an installer whose %s does not match the manifest', async (_label, download) => {
      const { installUpdate, getUpdateState, electron, AWS_S3, childProcess } =
        await loadAvailable();
      stubDownload(AWS_S3, download);

      await installUpdate();

      expect(getUpdateState()).toEqual({
        status: 'error',
        version: '1.2.0',
        message: 'Downloaded installer failed its integrity check',
      });
      expect(childProcess.spawn).not.toHaveBeenCalled();
      expect(
        fs.existsSync(
          path.join(
            electron.app.getPath('temp'),
            'doc-analysis-update',
            'DocumentAnalysis-Setup-1.2.0.exe'
          )
        )
      ).toBe(false);
    });

    it('reports a failed download', async () => {
      const { installUpdate, getUpdateState, AWS_S3 } = await loadAvailable();
      vi.spyOn(AWS_S3, 'downloadRelease').mockRejectedValue('network down');

      await installUpdate();

      expect(getUpdateState()).toMatchObject({ status: 'error', message: 'network down' });
    });

    it('ignores a second install while one is downloading', async () => {
      const { installUpdate, AWS_S3 } = await loadAvailable();
      let finish!: (sha: string) => void;
      const download = vi
        .spyOn(AWS_S3, 'downloadRelease')
        .mockImplementation(() => new Promise((resolve) => (finish = resolve)));

      const first = installUpdate();
      await vi.waitFor(() => expect(download).toHaveBeenCalled());
      await installUpdate();
      finish('wrong');
      await first;

      expect(download).toHaveBeenCalledTimes(1);
    });

    describe('Authenticode check', () => {
      function signature(
        childProcess: Loaded['childProcess'],
        sig: { Status: string; Subject: string }
      ) {
        childProcess.execFile.mockImplementation(((...args: unknown[]) => {
          const callback = args.at(-1) as (
            err: null,
            out: { stdout: string; stderr: string }
          ) => void;
          callback(null, { stdout: JSON.stringify(sig), stderr: '' });
        }) as never);
      }

      it('launches an installer signed by the required publisher', async () => {
        const { installUpdate, AWS_S3, childProcess } = await loadAvailable({
          publisher: 'Acme Software',
        });
        stubDownload(AWS_S3);
        signature(childProcess, { Status: 'Valid', Subject: 'CN=Acme Software, O=Acme' });

        await installUpdate();

        const [exe, , options] = childProcess.execFile.mock.calls[0] as unknown as [
          string,
          string[],
          { env: NodeJS.ProcessEnv },
        ];
        expect(exe).toBe('powershell.exe');
        expect(options.env['UPDATE_FILE']).toContain('DocumentAnalysis-Setup-1.2.0.exe');
        expect(childProcess.spawn).toHaveBeenCalled();
      });

      it.each([
        ['an invalid signature', { Status: 'HashMismatch', Subject: 'CN=Acme Software' }],
        ['a different publisher', { Status: 'Valid', Subject: 'CN=Someone Else' }],
        ['no signature', { Status: 'NotSigned', Subject: '' }],
      ])('refuses %s', async (_label, sig) => {
        const { installUpdate, getUpdateState, AWS_S3, childProcess } = await loadAvailable({
          publisher: 'Acme Software',
        });
        stubDownload(AWS_S3);
        signature(childProcess, sig);

        await installUpdate();

        expect(getUpdateState()).toMatchObject({
          status: 'error',
          message: expect.stringContaining('Installer signature rejected'),
        });
        expect(childProcess.spawn).not.toHaveBeenCalled();
      });
    });

    it('opens the disk image on macOS', async () => {
      restorePlatform();
      restorePlatform = setPlatform('darwin');
      const { installUpdate, electron, AWS_S3 } = await loadAvailable();
      stubDownload(AWS_S3);

      await installUpdate();

      expect(electron.shell.openPath).toHaveBeenCalledWith(
        expect.stringContaining('DocumentAnalysis-Setup-1.2.0')
      );
      expect(electron.app.quit).not.toHaveBeenCalled();
    });

    it('reports a disk image that fails to open', async () => {
      restorePlatform();
      restorePlatform = setPlatform('darwin');
      const { installUpdate, getUpdateState, electron, AWS_S3 } = await loadAvailable();
      stubDownload(AWS_S3);
      electron.shell.openPath.mockResolvedValue('Failed to open');

      await installUpdate();

      expect(getUpdateState()).toMatchObject({ status: 'error', message: 'Failed to open' });
    });

    it('reveals the download on Linux', async () => {
      restorePlatform();
      restorePlatform = setPlatform('linux');
      const { installUpdate, electron, AWS_S3 } = await loadAvailable();
      stubDownload(AWS_S3);

      await installUpdate();

      expect(electron.shell.showItemInFolder).toHaveBeenCalledWith(
        expect.stringContaining('DocumentAnalysis-Setup-1.2.0')
      );
    });
  });
});

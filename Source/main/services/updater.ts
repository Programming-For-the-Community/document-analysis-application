import fs from 'fs';
import path from 'path';
import { execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { app, BrowserWindow, shell } from 'electron';

import { AWS_S3 } from '../../classes/aws/s3';
import { AppConfig, ReleasesConfig } from '../../interfaces/config';
import { ReleaseManifest, UpdateState } from '../../interfaces/update';
import { RELEASE_PLATFORM_DIRS, REQUIRED_WIN_PUBLISHER } from '../../constants/updater';
import { compareVersions } from '../../utils/version';
import { Logger } from '../../utils/logger';

const execFileAsync = promisify(execFile);

// Lets `npm run dev` exercise the updater against the real bucket
const UPDATE_CHECK_IN_DEV = process.env['UPDATE_CHECK_IN_DEV'] === 'true';

// State lives in the main process so it survives renderer page navigations
// (login → home → project each load a fresh page).
let state: UpdateState = { status: 'idle' };
let manifest: ReleaseManifest | null = null;
let releasesConfig: ReleasesConfig | null = null;

function setState(next: UpdateState): void {
  state = next;
  BrowserWindow.getAllWindows()[0]?.webContents.send('update:status', state);
}

export function getUpdateState(): UpdateState {
  return state;
}

// Called after every successful login. Failures are logged, not shown — a
// missed update check should never get in the user's way.
export async function checkForUpdate(config: AppConfig): Promise<void> {
  if (!app.isPackaged && !UPDATE_CHECK_IN_DEV) {
    Logger.debug('Update check skipped in dev (set UPDATE_CHECK_IN_DEV=true to enable)');
    return;
  }
  if (state.status === 'downloading' || state.status === 'installing') return;

  const platformDir = RELEASE_PLATFORM_DIRS[process.platform];
  if (!platformDir) return;

  releasesConfig = config.releases;
  try {
    const latest = await AWS_S3.getReleaseJson<ReleaseManifest>(
      `${platformDir}/latest.json`,
      config.releases
    );
    const current = app.getVersion();

    if (!latest) {
      Logger.info('Update check: no release published for this platform yet');
      return;
    }
    if (compareVersions(latest.version, current) <= 0) {
      Logger.info(`Update check: up to date (installed ${current}, latest ${latest.version})`);
      return;
    }

    Logger.info(`Update check: ${latest.version} available (installed ${current})`);
    manifest = latest;
    setState({ status: 'available', version: latest.version, notes: latest.notes });
  } catch (err) {
    Logger.warn(`Update check failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function installUpdate(): Promise<void> {
  const release = manifest;
  if (!release || !releasesConfig) throw new Error('No update available');
  if (state.status === 'downloading' || state.status === 'installing') return;

  const { version } = release;
  const downloadDir = path.join(app.getPath('temp'), 'doc-analysis-update');
  const dest = path.join(downloadDir, path.basename(release.key));

  try {
    // Clear any earlier partial or superseded download
    await fs.promises.rm(downloadDir, { recursive: true, force: true });
    await fs.promises.mkdir(downloadDir, { recursive: true });

    setState({ status: 'downloading', version, percent: 0 });
    let lastPercent = 0;
    const sha512 = await AWS_S3.downloadRelease(release.key, dest, releasesConfig, (bytes) => {
      const percent = Math.min(100, Math.floor((bytes / release.size) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        setState({ status: 'downloading', version, percent });
      }
    });

    const { size } = await fs.promises.stat(dest);
    if (size !== release.size || sha512 !== release.sha512) {
      throw new Error('Downloaded installer failed its integrity check');
    }
    if (process.platform === 'win32') await verifyWindowsSignature(dest);

    Logger.info(`Update ${version} downloaded and verified — launching installer`);
    setState({ status: 'installing', version });
    await launchInstaller(dest);
  } catch (err) {
    await fs.promises.rm(dest, { force: true }).catch(() => undefined);
    const message = err instanceof Error ? err.message : String(err);
    Logger.error(`Update ${version} failed: ${message}`);
    setState({ status: 'error', version, message });
  }
}

// Only enforced once REQUIRED_WIN_PUBLISHER is set (i.e. installers are signed).
// The path is passed through the environment rather than interpolated into the
// command so a crafted filename can't inject PowerShell.
async function verifyWindowsSignature(filePath: string): Promise<void> {
  if (!REQUIRED_WIN_PUBLISHER) {
    Logger.warn('Update signature check skipped — REQUIRED_WIN_PUBLISHER is not set');
    return;
  }

  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      '$s = Get-AuthenticodeSignature -LiteralPath $env:UPDATE_FILE; ' +
        '[pscustomobject]@{ Status = [string]$s.Status; Subject = [string]$s.SignerCertificate.Subject } | ConvertTo-Json -Compress',
    ],
    { env: { ...process.env, UPDATE_FILE: filePath }, windowsHide: true }
  );

  const sig = JSON.parse(stdout) as { Status: string; Subject: string };
  if (sig.Status !== 'Valid' || !sig.Subject.includes(`CN=${REQUIRED_WIN_PUBLISHER}`)) {
    throw new Error(
      `Installer signature rejected (status: ${sig.Status}, signer: ${sig.Subject || 'none'})`
    );
  }
  Logger.info(`Installer signature valid: ${sig.Subject}`);
}

async function launchInstaller(filePath: string): Promise<void> {
  if (process.platform === 'win32') {
    // Same flags electron-updater uses for NSIS: silent install, then relaunch the app
    spawn(filePath, ['--updated', '/S', '--force-run'], {
      detached: true,
      stdio: 'ignore',
    }).unref();
    app.quit();
    return;
  }

  if (process.platform === 'darwin') {
    // Mounts the DMG; the user drags the new app into Applications
    const error = await shell.openPath(filePath);
    if (error) throw new Error(error);
    return;
  }

  shell.showItemInFolder(filePath);
}

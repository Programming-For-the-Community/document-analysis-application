import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { app } from 'electron';

import { AWS_SECRETS } from '../../classes/aws/secrets';
import { COMPOSE_FILE } from '../../constants/services/docker';
import { Logger } from '../../utils/logger';

// Docker's standard install locations. Checked before PATH because a packaged
// app launched from Finder/Explorer gets a minimal PATH (on macOS it usually
// lacks /usr/local/bin and /opt/homebrew/bin), and a writable PATH entry could
// otherwise shadow the real binary.
const DOCKER_CANDIDATES: Record<string, string[]> = {
  win32: [String.raw`C:\Program Files\Docker\Docker\resources\bin\docker.exe`],
  darwin: [
    '/usr/local/bin/docker',
    '/opt/homebrew/bin/docker',
    '/Applications/Docker.app/Contents/Resources/bin/docker',
  ],
  linux: ['/usr/bin/docker', '/usr/local/bin/docker'],
};

let dockerBinary: string | null = null;

function resolveDocker(): string {
  if (dockerBinary) return dockerBinary;
  const found = (DOCKER_CANDIDATES[process.platform] ?? []).find((p) => fs.existsSync(p));
  if (found) {
    dockerBinary = found;
  } else {
    Logger.warn('Docker not found in its standard install location — falling back to PATH lookup');
    dockerBinary = 'docker';
  }
  return dockerBinary;
}

function isDaemonRunning(): boolean {
  try {
    execFileSync(resolveDocker(), ['info'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function resolveComposePath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, COMPOSE_FILE);
  }
  return path.join(app.getAppPath(), '..', COMPOSE_FILE);
}

export function resolveDataPath(): string {
  // Dev machines have a D: drive for project data; fall back to ProgramData
  // on machines (incl. packaged installs) that only have C:.
  if (fs.existsSync('D:/')) return 'D:/Projects/.data/doc-analysis';
  return 'C:/ProgramData/doc-analysis';
}

export class DockerManager {
  private composePath = '';
  private dataPath = '';

  async start(): Promise<void> {
    this.composePath = resolveComposePath();
    this.dataPath = resolveDataPath();
    Logger.info(`Compose file: ${this.composePath}`);
    Logger.info(`Data path: ${this.dataPath}`);

    if (!isDaemonRunning()) {
      throw new Error(
        'Docker is not running. Please start Docker Desktop before launching this application.'
      );
    }
    Logger.info('Docker daemon running');

    Logger.info('Starting containers...');
    await this.runComposeUp();
    Logger.info('docker compose up completed');
  }

  private runComposeUp(): Promise<void> {
    return new Promise((resolve, reject) => {
      const { SVC_PWD, QDRANT_KEY } = AWS_SECRETS.secrets;
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        NEO4J_PASSWORD: SVC_PWD,
        QDRANT_API_KEY: QDRANT_KEY,
        DATA_PATH: this.dataPath,
      };
      const proc = spawn(
        resolveDocker(),
        ['compose', '-p', 'doc-analysis', '-f', this.composePath, 'up', '-d'],
        { env }
      );
      let output = '';
      proc.stdout?.on('data', (d: Buffer) => {
        output += d.toString();
      });
      proc.stderr?.on('data', (d: Buffer) => {
        output += d.toString();
      });
      proc.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          Logger.error(`docker compose up failed (exit ${String(code)}):\n${output}`);
          reject(new Error(`docker compose up failed (exit ${String(code)}):\n\n${output.trim()}`));
        }
      });
      proc.on('error', (err) => {
        Logger.error(`Failed to spawn docker: ${err.message}`);
        reject(
          new Error(
            `Failed to run docker compose: ${err.message}\n\nEnsure Docker Desktop is installed and docker is in your PATH.`
          )
        );
      });
    });
  }

  async stop(): Promise<void> {
    if (!this.composePath) return;
    Logger.info('Stopping application containers...');
    await new Promise<void>((resolve) => {
      const proc = spawn(resolveDocker(), [
        'compose',
        '-p',
        'doc-analysis',
        '-f',
        this.composePath,
        'stop',
      ]);
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
    Logger.info('Containers stopped');
  }
}

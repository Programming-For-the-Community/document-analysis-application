import { execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { app } from 'electron';

import { AWS_SECRETS } from '../../aws/secrets';
import { Logger } from '../../utils/logger';

const COMPOSE_FILE = 'docker-compose.yml';

function isDaemonRunning(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' });
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

function resolveDataPath(): string {
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
        'docker',
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
      const proc = spawn('docker', [
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

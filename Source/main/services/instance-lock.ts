import fs from 'fs';
import path from 'path';

import { Logger } from '../../utils/logger';

const LOCK_FILE = 'instances.lock';

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readPids(lockPath: string): number[] {
  try {
    const raw = fs.readFileSync(lockPath, 'utf-8');
    return raw
      .split('\n')
      .map((line) => Number(line.trim()))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function writePids(lockPath: string, pids: number[]): void {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, pids.join('\n'));
}

// Registers this process in the shared instance list, dropping any stale
// entries left behind by instances that crashed without unregistering.
export function registerInstance(dataPath: string): void {
  const lockPath = path.join(dataPath, LOCK_FILE);
  const pids = readPids(lockPath).filter(isRunning);
  pids.push(process.pid);
  writePids(lockPath, pids);
  Logger.debug(`Instance lock: registered pid ${process.pid} (${pids.length} instance(s) running)`);
}

// Removes this process from the shared instance list. Returns true if this
// was the last running instance, meaning shared Docker containers can be stopped.
export function unregisterInstance(dataPath: string): boolean {
  const lockPath = path.join(dataPath, LOCK_FILE);
  const pids = readPids(lockPath).filter((pid) => pid !== process.pid && isRunning(pid));
  writePids(lockPath, pids);
  Logger.debug(`Instance lock: unregistered pid ${process.pid} (${pids.length} instance(s) remaining)`);
  return pids.length === 0;
}

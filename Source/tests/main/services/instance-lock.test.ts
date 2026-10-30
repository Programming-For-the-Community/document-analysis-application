import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerInstance, unregisterInstance } from '../../../main/services/instance-lock';

// A pid that's safe to assume isn't running
const DEAD_PID = 2 ** 22 + 12345;

describe('instance lock', () => {
  let dataPath: string;
  const lockFile = () => path.join(dataPath, 'instances.lock');
  const pids = () => fs.readFileSync(lockFile(), 'utf-8').split('\n').filter(Boolean).map(Number);

  beforeEach(() => {
    dataPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lock-test-')), 'nested');
  });

  afterEach(() => {
    fs.rmSync(path.dirname(dataPath), { recursive: true, force: true });
  });

  it('registers this process, creating the data directory', () => {
    registerInstance(dataPath);
    expect(pids()).toEqual([process.pid]);
  });

  it('drops stale and malformed entries when registering', () => {
    fs.mkdirSync(dataPath, { recursive: true });
    fs.writeFileSync(lockFile(), `${DEAD_PID}\nnot-a-pid\n-4\n${process.ppid}\n`);

    registerInstance(dataPath);

    expect(pids()).toEqual([process.ppid, process.pid]);
  });

  it('reports the last instance so containers can be stopped', () => {
    registerInstance(dataPath);
    expect(unregisterInstance(dataPath)).toBe(true);
    expect(pids()).toEqual([]);
  });

  it('keeps containers running while another instance is alive', () => {
    fs.mkdirSync(dataPath, { recursive: true });
    fs.writeFileSync(lockFile(), `${process.ppid}\n${process.pid}`);

    expect(unregisterInstance(dataPath)).toBe(false);
    expect(pids()).toEqual([process.ppid]);
  });

  it('treats a missing lock file as no other instances', () => {
    expect(unregisterInstance(dataPath)).toBe(true);
  });
});

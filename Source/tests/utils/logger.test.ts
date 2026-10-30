import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import winston from 'winston';

import { Logger } from '../../utils/logger';

// tests/setup.ts silences the logger everywhere else
vi.unmock('../../utils/logger');

const MESSAGE = Symbol.for('message');
const stripAnsi = (s: string) => s.replace(/\u001b\[\d+m/g, '');

describe('Logger', () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    vi.spyOn(winston.transports.Console.prototype, 'log').mockImplementation(
      (...args: unknown[]) => {
        const [info, next] = args as [Record<string | symbol, unknown>, () => void];
        lines.push(stripAnsi(String(info[MESSAGE])));
        next();
      }
    );
    (Logger as unknown as { instance: unknown }).instance = null;
  });

  afterEach(() => {
    delete process.env['LOG_LEVEL'];
  });

  it('formats messages with the level, environment and calling file', () => {
    Logger.init({
      app: 'doc-app',
      version: '9.9.9',
      platform: 'testos',
      release: '1',
      processor: 'cpu',
    });

    Logger.info('hello');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(
      /^\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] INFO: \[processor: cpu, platform: testos@1, app: doc-app@9\.9\.9\]: \[tests\/utils\/logger\.test\.ts\] hello$/
    );
  });

  it('logs at every level that the configured level allows', () => {
    Logger.init({ level: 'debug' });

    Logger.debug('d');
    Logger.info('i');
    Logger.warn('w');
    Logger.error('e');

    expect(lines.map((l) => /\] (\w+):/.exec(l)![1])).toEqual(['DEBUG', 'INFO', 'WARN', 'ERROR']);
  });

  it('changes level at runtime', () => {
    Logger.init({ level: 'info' });
    Logger.debug('hidden');

    Logger.setLevel('debug');
    Logger.debug('shown');

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('shown');
  });

  it('initialises itself from the environment on first use', () => {
    process.env['LOG_LEVEL'] = 'warn';

    Logger.info('hidden');
    Logger.warn('shown');

    expect(lines).toHaveLength(1);
  });

  it('can change level before it is initialised', () => {
    (Logger as unknown as { config: unknown }).config = null;
    expect(() => Logger.setLevel('error')).not.toThrow();
  });
});

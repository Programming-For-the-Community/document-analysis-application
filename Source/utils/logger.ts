import os from 'os';
import winston from 'winston';

import { LoggerConfig } from '../interfaces/app';

export class Logger {
  private static instance: winston.Logger | null = null;
  private static config: LoggerConfig | null = null;

  public static init(cfg?: Partial<LoggerConfig>): void {
    Logger.config = {
      processor: os.cpus()[0]?.model ?? 'unknown',
      platform: os.platform(),
      release: os.release(),
      app: process.env['APP_NAME'] ?? 'unknown-app',
      version: process.env['APP_VERSION'] ?? '0.0.0',
      format: process.env['LOG_FORMAT'] ?? '[%s] %s: [processor: %s, platform: %s@%s, app: %s@%s]: %s',
      level: process.env['LOG_LEVEL'] ?? 'info',
      ...cfg,
    };

    const transports: winston.transport[] = [new winston.transports.Console()];

    Logger.instance = winston.createLogger({
      level: Logger.config.level,
      format: Logger.buildFormat(),
      transports,
    });
  }

  private static buildFormat(): winston.Logform.Format {
    const { format: wformat } = winston;
    // Uppercase the level before colorize so that toUpperCase() never runs on
    // ANSI escape codes — colorize ends sequences with a lowercase 'm', which
    // toUpperCase() would corrupt into 'M', breaking terminal color rendering.
    return wformat.combine(
      wformat.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      wformat((info) => { info.level = info.level.toUpperCase(); return info; })(),
      wformat.colorize({ all: true }),
      wformat.printf((info) => Logger.formatMessage(info))
    );
  }

  private static formatMessage(info: winston.Logform.TransformableInfo): string {
    const cfg = Logger.config!;
    // caller is attached to the info object by each public method before
    // Winston's format pipeline runs — by the time formatMessage executes,
    // the original call stack has been replaced by Winston internals.
    const caller = (info['caller'] as string) ?? 'unknown';
    const template = cfg.format;
    return template
      .replace('%s', info['timestamp'] as string)
      .replace('%s', info.level)
      .replace('%s', cfg.processor)
      .replace('%s', cfg.platform)
      .replace('%s', cfg.release)
      .replace('%s', cfg.app)
      .replace('%s', cfg.version)
      .replace('%s', `[${caller}] ${info.message as string}`);
  }

  // Called from the public methods below, where the stack is simply:
  //   [0] captureCallerFile  (logger.ts)
  //   [1] Logger.info/warn/… (logger.ts)
  //   [2] actual caller
  // No Winston frames are involved yet, so a simple thisFile skip is enough.
  private static captureCallerFile(): string {
    const originalFunc = Error.prepareStackTrace;

    try {
      const err = new Error();
      Error.prepareStackTrace = (_, stack) => stack;

      const stack = err.stack as unknown as NodeJS.CallSite[];
      const thisFile = __filename.toLowerCase();

      for (let i = 0; i < stack.length; i++) {
        const file = stack[i]?.getFileName() ?? '';
        if (file && file.toLowerCase() !== thisFile) {
          return file
            .replace(/.*[\\/]Source[\\/]/i, '')
            .replace(/^dist[\\/]/i, '')
            .replace(/\\/g, '/')
            .replace(/\.js$/, '.ts');
        }
      }
      return 'unknown';
    } finally {
      Error.prepareStackTrace = originalFunc;
    }
  }

  private static get log(): winston.Logger {
    if (!Logger.instance) Logger.init();
    return Logger.instance!;
  }

  public static info(message: string, ...meta: unknown[]): void {
    Logger.log.info(message, { caller: Logger.captureCallerFile() }, ...meta);
  }

  public static warn(message: string, ...meta: unknown[]): void {
    Logger.log.warn(message, { caller: Logger.captureCallerFile() }, ...meta);
  }

  public static error(message: string, ...meta: unknown[]): void {
    Logger.log.error(message, { caller: Logger.captureCallerFile() }, ...meta);
  }

  public static debug(message: string, ...meta: unknown[]): void {
    Logger.log.debug(message, { caller: Logger.captureCallerFile() }, ...meta);
  }

  public static setLevel(level: string): void {
    Logger.log.level = level;
    if (Logger.config) Logger.config.level = level;
  }
}
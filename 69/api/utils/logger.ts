import { writeFileSync, existsSync, mkdirSync, appendFileSync, statSync, renameSync } from 'fs';
import { join } from 'path';

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'none';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  none: 4,
};

const currentLevel: LogLevel = (process.env.LOG_LEVEL as LogLevel) || 'info';
const minLevel = LOG_LEVELS[currentLevel];

const LOG_DIR = join(process.cwd(), 'logs');
const MAX_CONSOLE_BUFFER = 50;
const FLUSH_INTERVAL = 3000;
const MAX_FILE_SIZE = 5 * 1024 * 1024;

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });

class Logger {
  private name: string;
  private consoleBuffer: string[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private logFilePath: string;
  private archiveDir: string;

  constructor(name: string) {
    this.name = name;
    this.archiveDir = join(LOG_DIR, 'archive');
    if (!existsSync(this.archiveDir)) mkdirSync(this.archiveDir, { recursive: true });

    this.logFilePath = join(LOG_DIR, `${name}-${new Date().toISOString().split('T')[0]}.log`);
    this.setupAutoFlush();
  }

  private setupAutoFlush() {
    this.flushTimer = setInterval(() => {
      this.flushConsoleBuffer();
      this.rotateFileIfNeeded();
    }, FLUSH_INTERVAL);
  }

  private flushConsoleBuffer() {
    if (this.consoleBuffer.length > 0) {
      console.log(this.consoleBuffer.join('\n'));
      this.consoleBuffer = [];
    }
  }

  private writeToFileSync(formatted: string) {
    try {
      appendFileSync(this.logFilePath, formatted + '\n');
    } catch {
      // silently fail
    }
  }

  private rotateFileIfNeeded() {
    try {
      if (!existsSync(this.logFilePath)) return;
      const stats = statSync(this.logFilePath);
      if (stats.size >= MAX_FILE_SIZE) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const archivePath = join(this.archiveDir, `${this.name}-${timestamp}.log`);
        renameSync(this.logFilePath, archivePath);
        this.logFilePath = join(LOG_DIR, `${this.name}-${new Date().toISOString().split('T')[0]}.log`);
      }
    } catch {
      // silently fail
    }
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= minLevel;
  }

  private format(level: string, message: string, ...args: unknown[]): string {
    const timestamp = new Date().toISOString();
    const argsStr = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
    return `[${timestamp}] [${level.toUpperCase()}] [${this.name}] ${message}${argsStr}`;
  }

  private log(level: LogLevel, method: 'log' | 'warn' | 'error', message: string, ...args: unknown[]) {
    if (!this.shouldLog(level)) return;

    const formatted = this.format(level, message, ...args);

    if (level === 'error' || level === 'warn') {
      console[method](formatted);
    } else if (this.consoleBuffer.length >= MAX_CONSOLE_BUFFER) {
      this.flushConsoleBuffer();
      console.log(formatted);
    } else {
      this.consoleBuffer.push(formatted);
    }

    this.writeToFileSync(formatted);
  }

  debug(message: string, ...args: unknown[]) {
    this.log('debug', 'log', message, ...args);
  }

  info(message: string, ...args: unknown[]) {
    this.log('info', 'log', message, ...args);
  }

  warn(message: string, ...args: unknown[]) {
    this.log('warn', 'warn', message, ...args);
  }

  error(message: string, ...args: unknown[]) {
    this.log('error', 'error', message, ...args);
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushConsoleBuffer();
    }
  }
}

const loggers = new Map<string, Logger>();

export function getLogger(name: string): Logger {
  if (!loggers.has(name)) {
    loggers.set(name, new Logger(name));
  }
  return loggers.get(name)!;
}

export function cleanupLoggers() {
  loggers.forEach((logger) => logger.destroy());
  loggers.clear();
}

import winston from 'winston';
import Transport from 'winston-transport';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { LogLevel, LogEntry } from '@shared/types';

const LOG_DIR = process.env.NODE_ENV === 'development'
  ? path.join(process.cwd(), 'logs')
  : (() => {
      try {
        const { app } = require('electron');
        return path.join(app.getPath('userData'), 'logs');
      } catch {
        return path.join(process.cwd(), 'logs');
      }
    })();

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const LOG_BUFFER_SIZE = 100;
const logBuffer: LogEntry[] = [];
let flushTimer: NodeJS.Timeout | null = null;

const dbLogger = {
  write: async (entry: LogEntry): Promise<void> => {
    try {
      const { AppDataSource } = require('@backend/database/data-source');
      const { LogEntity } = require('@backend/database/entities/Log.entity');

      if (AppDataSource?.isInitialized) {
        const repo = AppDataSource.getRepository(LogEntity);
        const log = repo.create(entry);
        await repo.save(log);
      } else {
        logBuffer.push(entry);
        if (logBuffer.length > LOG_BUFFER_SIZE) {
          logBuffer.shift();
        }
      }
    } catch (error) {
      logBuffer.push(entry);
      if (logBuffer.length > LOG_BUFFER_SIZE) {
        logBuffer.shift();
      }
      const fallbackPath = path.join(LOG_DIR, 'db-log-failures.log');
      const line = `${new Date().toISOString()} [${entry.level}] [${entry.module}] [${entry.action}]: ${entry.message}\n`;
      fs.appendFileSync(fallbackPath, line);
    }
  },

  flush: async (): Promise<void> => {
    if (logBuffer.length === 0) return;

    try {
      const { AppDataSource } = require('@backend/database/data-source');
      const { LogEntity } = require('@backend/database/entities/Log.entity');

      if (AppDataSource?.isInitialized) {
        const repo = AppDataSource.getRepository(LogEntity);
        const entries = [...logBuffer];
        logBuffer.length = 0;
        const entities = entries.map(entry => repo.create(entry));
        await repo.save(entities);
      }
    } catch (error) {
      // Buffer flush failed, keep in buffer for next attempt
    }
  }
};

const startFlushTimer = (): void => {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    dbLogger.flush().catch(() => {});
  }, 5000);
};

const stopFlushTimer = (): void => {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = null;
  }
};

class DatabaseTransport extends Transport {
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(opts?: Transport.TransportStreamOptions) {
    super(opts);
  }

  _write(info: winston.LogEntry, enc: string, callback: () => void) {
    const entry: LogEntry = {
      id: uuidv4(),
      level: info.level as LogLevel,
      module: (info as Record<string, unknown>).module as string || 'unknown',
      action: (info as Record<string, unknown>).action as string || 'unknown',
      message: info.message,
      details: (info as Record<string, unknown>).details as Record<string, unknown> | undefined,
      createdAt: new Date()
    };

    this.writeQueue = this.writeQueue
      .then(() => dbLogger.write(entry))
      .catch(() => {});

    callback();
  }
}

const addCustomFields = winston.format((info) => {
  return info;
});

const customFormat = winston.format.printf(({ timestamp, level, module, action, message, details }) => {
  let log = `${timestamp} [${level.toUpperCase()}] [${module || 'unknown'}] [${action || 'unknown'}]: ${message}`;
  if (details) {
    log += `\n${JSON.stringify(details, null, 2)}`;
  }
  return log;
});

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'error.log'),
      level: 'error'
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, 'combined.log')
    }),
    new DatabaseTransport()
  ]
});

if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      customFormat
    )
  }));
}

startFlushTimer();

process.on('beforeExit', () => {
  stopFlushTimer();
  dbLogger.flush().catch(() => {});
});

export const createModuleLogger = (moduleName: string) => {
  return {
    info: (action: string, message: string, details?: Record<string, unknown>) => {
      logger.info(message, { module: moduleName, action, details });
    },
    warn: (action: string, message: string, details?: Record<string, unknown>) => {
      logger.warn(message, { module: moduleName, action, details });
    },
    error: (action: string, message: string, details?: Record<string, unknown>) => {
      logger.error(message, { module: moduleName, action, details });
    },
    debug: (action: string, message: string, details?: Record<string, unknown>) => {
      logger.debug(message, { module: moduleName, action, details });
    }
  };
};

export { dbLogger, logBuffer, startFlushTimer, stopFlushTimer };
export default logger;

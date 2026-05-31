import * as winston from 'winston';
import * as path from 'path';
import * as fs from 'fs';
import { config } from '../config';

const logDir = path.join(config.storagePath, 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const customFormat = winston.format.printf(({ level, message, timestamp }) => {
  return `${timestamp} [${level.toUpperCase()}]: ${message}`;
});

export const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    customFormat
  ),
  transports: [
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10
    })
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

export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  info(message: string, meta?: Record<string, unknown>) {
    logger.info(`[${this.context}] ${message}`, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    logger.warn(`[${this.context}] ${message}`, meta);
  }

  error(message: string, error?: Error, meta?: Record<string, unknown>) {
    const errorMsg = error ? `${message} - ${error.message}` : message;
    logger.error(`[${this.context}] ${errorMsg}`, { error, ...meta });
  }

  debug(message: string, meta?: Record<string, unknown>) {
    logger.debug(`[${this.context}] ${message}`, meta);
  }
}

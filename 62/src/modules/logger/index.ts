import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';
import { config } from '../../utils/config';
import { LogEntry } from '../../types';

const logDir = config.logging.dir;

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

export interface LogCleanupResult {
  deletedFiles: string[];
  deletedCount: number;
  freedSpace: number;
  errors: string[];
  invalidFiles: string[];
}

const fileRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'application-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '100m',
  maxFiles: '14d',
  level: config.logging.level,
});

const errorRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '100m',
  maxFiles: '30d',
  level: 'error',
});

const auditRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(logDir, 'audit-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '100m',
  maxFiles: '90d',
  level: 'info',
});

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.printf(({ timestamp, level, message, module, requestId, traceId, data }) => {
    const parts = [timestamp, level, `[${module || 'default'}]`];
    if (requestId) parts.push(`[req:${requestId}]`);
    if (traceId) parts.push(`[trace:${traceId}]`);
    parts.push(message);
    if (data) parts.push(JSON.stringify(data));
    return parts.join(' ');
  })
);

const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports: [
    fileRotateTransport,
    errorRotateTransport,
    auditRotateTransport,
    new winston.transports.Console({
      format: consoleFormat,
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
    }),
  ],
});

export class LoggerService {
  private moduleName: string;

  constructor(moduleName: string) {
    this.moduleName = moduleName;
  }

  private formatEntry(entry: Partial<LogEntry>): LogEntry {
    return {
      timestamp: Date.now(),
      level: entry.level || 'info',
      message: entry.message || '',
      module: this.moduleName,
      requestId: entry.requestId,
      traceId: entry.traceId,
      data: entry.data,
    };
  }

  debug(message: string, data?: Record<string, unknown>, requestId?: string, traceId?: string): void {
    const entry = this.formatEntry({ level: 'debug', message, data, requestId, traceId });
    logger.debug(entry.message, { ...entry, ...data });
  }

  info(message: string, data?: Record<string, unknown>, requestId?: string, traceId?: string): void {
    const entry = this.formatEntry({ level: 'info', message, data, requestId, traceId });
    logger.info(entry.message, { ...entry, ...data });
  }

  warn(message: string, data?: Record<string, unknown>, requestId?: string, traceId?: string): void {
    const entry = this.formatEntry({ level: 'warn', message, data, requestId, traceId });
    logger.warn(entry.message, { ...entry, ...data });
  }

  error(message: string, errorOrData?: Error | Record<string, unknown>, requestId?: string, traceId?: string): void {
    let data: Record<string, unknown> | undefined;
    let errorObj: Error | undefined;

    if (errorOrData instanceof Error) {
      errorObj = errorOrData;
      data = { error: errorObj.message, stack: errorObj.stack };
    } else if (errorOrData) {
      data = errorOrData;
    }

    const entry = this.formatEntry({ level: 'error', message, data, requestId, traceId });
    logger.error(entry.message, { ...entry, ...data });
  }

  fatal(message: string, errorOrData?: Error | Record<string, unknown>, requestId?: string, traceId?: string): void {
    let data: Record<string, unknown> | undefined;
    let errorObj: Error | undefined;

    if (errorOrData instanceof Error) {
      errorObj = errorOrData;
      data = { error: errorObj.message, stack: errorObj.stack };
    } else if (errorOrData) {
      data = errorOrData;
    }

    const entry = this.formatEntry({ level: 'fatal', message, data, requestId, traceId });
    logger.error(entry.message, { ...entry, ...data });
  }

  audit(action: string, data: Record<string, unknown>, requestId?: string, traceId?: string): void {
    const entry = this.formatEntry({
      level: 'info',
      message: `AUDIT: ${action}`,
      data: { audit: true, action, ...data },
      requestId,
      traceId,
    });
    logger.info(entry.message, { ...entry });
  }
}

export function getLogger(moduleName: string): LoggerService {
  return new LoggerService(moduleName);
}

function isValidLogFile(fileName: string): boolean {
  const logPatterns = [
    /^application-\d{4}-\d{2}-\d{2}\.log$/,
    /^error-\d{4}-\d{2}-\d{2}\.log$/,
    /^audit-\d{4}-\d{2}-\d{2}\.log$/,
    /^\.log$/,
  ];
  return logPatterns.some(pattern => pattern.test(fileName));
}

function isLogFileExpired(fileName: string, maxAgeDays: number): boolean {
  const dateMatch = fileName.match(/-(\d{4}-\d{2}-\d{2})\.log$/);
  if (!dateMatch) return false;

  const fileDate = new Date(dateMatch[1]);
  const now = new Date();
  const diffDays = (now.getTime() - fileDate.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > maxAgeDays;
}

function isFileContentValid(filePath: string): boolean {
  try {
    const stats = fs.statSync(filePath);
    if (stats.size === 0) return true;

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(line => line.trim());

    for (const line of lines.slice(0, 10)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.timestamp && parsed.level && parsed.message) {
          return true;
        }
      } catch {
        continue;
      }
    }

    return lines.length === 0;
  } catch {
    return false;
  }
}

export function cleanupLogs(options?: {
  maxAgeDays?: number;
  dryRun?: boolean;
  cleanInvalid?: boolean;
}): LogCleanupResult {
  const maxAgeDays = options?.maxAgeDays ?? 90;
  const dryRun = options?.dryRun ?? false;
  const cleanInvalid = options?.cleanInvalid ?? true;

  const result: LogCleanupResult = {
    deletedFiles: [],
    deletedCount: 0,
    freedSpace: 0,
    errors: [],
    invalidFiles: [],
  };

  try {
    if (!fs.existsSync(logDir)) {
      result.errors.push('日志目录不存在');
      return result;
    }

    const files = fs.readdirSync(logDir);

    for (const file of files) {
      const filePath = path.join(logDir, file);

      try {
        const stats = fs.statSync(filePath);

        if (!stats.isFile()) continue;

        if (!isValidLogFile(file)) {
          result.invalidFiles.push(file);
          if (cleanInvalid && !dryRun) {
            fs.unlinkSync(filePath);
            result.deletedFiles.push(file);
            result.deletedCount++;
            result.freedSpace += stats.size;
          }
          continue;
        }

        if (isLogFileExpired(file, maxAgeDays)) {
          if (!dryRun) {
            fs.unlinkSync(filePath);
            result.deletedFiles.push(file);
            result.deletedCount++;
            result.freedSpace += stats.size;
          } else {
            result.deletedFiles.push(file);
            result.deletedCount++;
            result.freedSpace += stats.size;
          }
          continue;
        }

        if (cleanInvalid && !isFileContentValid(filePath)) {
          result.invalidFiles.push(file);
          if (!dryRun) {
            fs.unlinkSync(filePath);
            result.deletedFiles.push(file);
            result.deletedCount++;
            result.freedSpace += stats.size;
          }
        }
      } catch (error) {
        result.errors.push(`处理文件 ${file} 失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
  } catch (error) {
    result.errors.push(`清理日志失败: ${error instanceof Error ? error.message : '未知错误'}`);
  }

  const cleanupLogger = getLogger('LogCleanup');
  cleanupLogger.info('日志清理完成', {
    deletedCount: result.deletedCount,
    freedSpace: `${(result.freedSpace / 1024 / 1024).toFixed(2)} MB`,
    errors: result.errors.length,
    dryRun,
  });

  return result;
}

export function getLogStats(): {
  totalFiles: number;
  totalSize: number;
  fileBreakdown: Record<string, { count: number; size: number }>;
} {
  const result = {
    totalFiles: 0,
    totalSize: 0,
    fileBreakdown: {} as Record<string, { count: number; size: number }>,
  };

  try {
    if (!fs.existsSync(logDir)) return result;

    const files = fs.readdirSync(logDir);

    for (const file of files) {
      const filePath = path.join(logDir, file);
      try {
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) continue;

        result.totalFiles++;
        result.totalSize += stats.size;

        let category = 'other';
        if (file.startsWith('application-')) category = 'application';
        else if (file.startsWith('error-')) category = 'error';
        else if (file.startsWith('audit-')) category = 'audit';

        if (!result.fileBreakdown[category]) {
          result.fileBreakdown[category] = { count: 0, size: 0 };
        }
        result.fileBreakdown[category].count++;
        result.fileBreakdown[category].size += stats.size;
      } catch {
        continue;
      }
    }
  } catch {
    // ignore
  }

  return result;
}

export default logger;

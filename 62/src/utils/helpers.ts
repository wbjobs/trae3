import { v4 as uuidv4 } from 'uuid';
import { Message, MessageMetadata } from '../types';

export function generateId(): string {
  return uuidv4();
}

export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  initialDelay: number = 1000,
  backoffFactor: number = 2
): Promise<T> {
  return new Promise((resolve, reject) => {
    let attempt = 1;

    const attemptFn = async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        if (attempt >= maxAttempts) {
          reject(error);
          return;
        }

        const delayMs = initialDelay * Math.pow(backoffFactor, attempt - 1);
        attempt++;
        setTimeout(attemptFn, delayMs);
      }
    };

    attemptFn();
  });
}

export function createMessage(
  type: Message['type'],
  priority: Message['priority'],
  payload: Record<string, unknown>,
  options?: Partial<{
    targetRegion: string;
    source: string;
    requestId: string;
    traceId: string;
    userId: string;
    clientIp: string;
    userAgent: string;
  }>
): Message {
  const requestId = options?.requestId || generateId();
  const traceId = options?.traceId || generateId();

  const metadata: MessageMetadata = {
    requestId,
    traceId,
    userId: options?.userId,
    clientIp: options?.clientIp,
    userAgent: options?.userAgent,
    retryCount: 0,
  };

  return {
    id: generateId(),
    type,
    priority,
    payload,
    targetRegion: options?.targetRegion,
    source: options?.source || 'api-gateway',
    timestamp: Date.now(),
    metadata,
  };
}

export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

export function calculatePercentage(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 10000) / 100;
}

export function isValidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  keysToRemove: string[] = ['password', 'token', 'secret', 'authorization']
): Partial<T> {
  const result: Partial<T> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (keysToRemove.some(k => key.toLowerCase().includes(k.toLowerCase()))) {
      continue;
    }
    result[key as keyof T] = value as T[keyof T];
  }

  return result;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '未知错误';
}

export function parseBoolean(value: string | boolean | undefined, defaultValue: boolean = false): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  return value.toLowerCase() === 'true' || value === '1';
}

export function parseIntSafe(value: string | number | undefined, defaultValue: number = 0): number {
  if (value === undefined) return defaultValue;
  if (typeof value === 'number') return value;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function truncateString(str: string, maxLength: number, suffix: string = '...'): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - suffix.length) + suffix;
}

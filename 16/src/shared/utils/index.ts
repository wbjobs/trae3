export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const retryAsync = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 5000,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> => {
  let lastError: Error | undefined;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (onRetry) {
        onRetry(attempt, lastError);
      }
      if (attempt < maxRetries) {
        await delay(delayMs * attempt);
      }
    }
  }
  throw lastError;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
};

export const formatUptime = (seconds: number): string => {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分钟`);
  parts.push(`${secs}秒`);
  return parts.join(' ');
};

export const parseSemver = (version: string): { major: number; minor: number; patch: number; prerelease?: string } => {
  const match = version.match(/v?(\d+)\.(\d+)\.(\d+)(?:[-.]?([\w.]+))?/);
  if (!match) {
    return { major: 0, minor: 0, patch: 0 };
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4]
  };
};

export const withTimeout = <T>(promise: Promise<T>, ms: number, message: string = '操作超时'): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

export const chunkArray = <T>(array: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
};

export const createCancelablePromise = <T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } => {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

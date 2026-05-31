import type { ScriptLanguage } from '@/types';

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

export const formatRelativeTime = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  if (hours < 24) return `${hours} 小时前`;
  if (days < 7) return `${days} 天前`;
  
  return formatDate(dateString);
};

export const getLanguageIcon = (language: ScriptLanguage): string => {
  const icons: Record<ScriptLanguage, string> = {
    javascript: 'JS',
    typescript: 'TS',
    python: 'PY',
    rust: 'RS',
    go: 'GO',
    bash: 'SH',
    powershell: 'PS',
    sql: 'SQL',
    json: 'JSON',
    yaml: 'YAML'
  };
  return icons[language] || '?';
};

export const getLanguageColor = (language: ScriptLanguage): string => {
  const colors: Record<ScriptLanguage, string> = {
    javascript: '#f7df1e',
    typescript: '#3178c6',
    python: '#3776ab',
    rust: '#dea584',
    go: '#00add8',
    bash: '#4eaa25',
    powershell: '#012456',
    sql: '#e38c00',
    json: '#292929',
    yaml: '#cb171e'
  };
  return colors[language] || '#888888';
};

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};

export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle: boolean;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
};

export const escapeRegExp = (string: string): string => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

export const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text;
  return text.substr(0, maxLength - 3) + '...';
};

export const isTextFile = (filename: string): boolean => {
  const textExtensions = [
    '.js', '.jsx', '.ts', '.tsx', '.py', '.rs', '.go', '.sh', '.ps1',
    '.sql', '.json', '.yaml', '.yml', '.xml', '.html', '.css', '.md',
    '.txt', '.ini', '.cfg', '.conf'
  ];
  return textExtensions.some(ext => filename.toLowerCase().endsWith(ext));
};

export const getFileExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
};

export const getFilenameWithoutExtension = (filename: string): string => {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.slice(0, -1).join('.') : filename;
};

export const normalizePath = (path: string): string => {
  return path.replace(/\\/g, '/');
};

export const joinPaths = (...paths: string[]): string => {
  return paths.map(p => normalizePath(p)).join('/').replace(/\/+/g, '/');
};

export const getRelativePath = (basePath: string, fullPath: string): string => {
  const normalizedBase = normalizePath(basePath);
  const normalizedFull = normalizePath(fullPath);
  
  if (normalizedFull.startsWith(normalizedBase)) {
    return normalizedFull.substring(normalizedBase.length).replace(/^\//, '');
  }
  return normalizedFull;
};

export const deepClone = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime()) as unknown as T;
  if (obj instanceof Array) return obj.map(item => deepClone(item)) as unknown as T;
  if (typeof obj === 'object') {
    const cloned = {} as T;
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        cloned[key] = deepClone(obj[key]);
      }
    }
    return cloned;
  }
  return obj;
};

export const shallowEqual = (obj1: any, obj2: any): boolean => {
  if (obj1 === obj2) return true;
  if (!obj1 || !obj2) return false;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  
  return true;
};

export const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

export const retry = async <T>(
  fn: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> => {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      await sleep(delay);
      return retry(fn, retries - 1, delay * 2);
    }
    throw error;
  }
};

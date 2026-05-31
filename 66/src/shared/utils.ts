import crypto from 'crypto-js';
import { SupportedLanguages, ProjectFile } from './types';

export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function generateVersion(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${random}`;
}

export function getLanguageFromFileName(fileName: string): string {
  const ext = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  return SupportedLanguages[ext] || 'plaintext';
}

export function getFileExtension(fileName: string): string {
  return fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < week) return `${Math.floor(diff / day)} 天前`;
  return formatDate(timestamp);
}

export function calculateFileHash(content: string): string {
  return crypto.SHA256(content).toString();
}

export function isValidFileName(name: string): boolean {
  const invalidChars = /[<>:"/\\|?*]/;
  return !invalidChars.test(name) && name.length > 0 && name.length <= 255;
}

export function debounce<T extends (...args: unknown[]) => void>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

export function throttle<T extends (...args: unknown[]) => void>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

export function createProjectFile(
  name: string,
  path: string,
  content: string = ''
): ProjectFile {
  const now = Date.now();
  return {
    id: generateId(),
    name,
    path,
    content,
    language: getLanguageFromFileName(name),
    size: new TextEncoder().encode(content).length,
    lastModified: now,
    isDirty: false,
    version: generateVersion(),
  };
}

export function compareFiles(
  file1: ProjectFile,
  file2: ProjectFile
): { added: string[]; removed: string[]; modified: string[] } {
  const lines1 = file1.content.split('\n');
  const lines2 = file2.content.split('\n');
  const added: string[] = [];
  const removed: string[] = [];
  const modified: string[] = [];

  const maxLines = Math.max(lines1.length, lines2.length);
  for (let i = 0; i < maxLines; i++) {
    if (i >= lines1.length) {
      added.push(`+ ${lines2[i]}`);
    } else if (i >= lines2.length) {
      removed.push(`- ${lines1[i]}`);
    } else if (lines1[i] !== lines2[i]) {
      modified.push(`~ ${lines1[i]} -> ${lines2[i]}`);
    }
  }

  return { added, removed, modified };
}

export function validatePath(filePath: string): boolean {
  if (!filePath || filePath.length === 0) return false;
  const normalized = filePath.replace(/\\/g, '/');
  if (normalized.includes('..')) return false;
  const pathWithoutDrive = normalized.replace(/^[A-Za-z]:/, '');
  if (/[<>"|?*]/.test(pathWithoutDrive)) return false;
  return true;
}

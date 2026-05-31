import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import type { FileSnapshot, BuildSnapshot, SectionDiff } from './types';

export function generateId(): string {
  return crypto.randomUUID();
}

export function calculateMD5(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    
    stream.on('error', reject);
    stream.on('data', (data) => hash.update(data));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function calculateMD5Buffer(buffer: Buffer): string {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

export function calculateMD5Sync(data: string | Buffer): string {
  return crypto.createHash('md5').update(data).digest('hex');
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
  if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);
  
  return parts.join(' ') || '0s';
}

export function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function findFilesByPattern(dir: string, pattern: RegExp): string[] {
  const results: string[] = [];
  
  function walk(currentDir: string) {
    const files = fs.readdirSync(currentDir);
    
    for (const file of files) {
      const filePath = path.join(currentDir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        walk(filePath);
      } else if (pattern.test(file)) {
        results.push(filePath);
      }
    }
  }
  
  walk(dir);
  return results;
}

export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  
  return 0;
}

export function isValidVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+)?$/.test(version);
}

export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

export function retryOperation<T>(
  operation: () => Promise<T>,
  retries: number = 3,
  delay: number = 1000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const attempt = (remaining: number) => {
      operation()
        .then(resolve)
        .catch((error) => {
          if (remaining > 0) {
            setTimeout(() => attempt(remaining - 1), delay);
          } else {
            reject(error);
          }
        });
    };
    attempt(retries);
  });
}

export function parseEnvString(envStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = envStr.split('\n').filter((line) => line.trim() && !line.startsWith('#'));
  
  for (const line of lines) {
    const [key, ...valueParts] = line.split('=');
    if (key) {
      result[key.trim()] = valueParts.join('=').trim();
    }
  }
  
  return result;
}

export function stringifyEnv(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export async function createFileSnapshot(filePath: string, projectPath: string, includeContent: boolean = false): Promise<FileSnapshot | null> {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;

    const md5 = await calculateMD5(filePath);
    let lineCount = 0;
    let content: string | undefined;

    if (includeContent) {
      content = fs.readFileSync(filePath, 'utf-8');
      lineCount = content.split('\n').length;
    } else {
      const buffer = fs.readFileSync(filePath);
      lineCount = buffer.toString().split('\n').length;
    }

    return {
      path: path.relative(projectPath, filePath),
      size: stat.size,
      md5,
      modifiedTime: stat.mtime.getTime(),
      lineCount,
      content
    };
  } catch (e) {
    console.warn(`Failed to create snapshot for ${filePath}:`, e);
    return null;
  }
}

export async function createBuildSnapshot(
  buildId: string,
  projectPath: string,
  filePattern: RegExp = /\.(c|cpp|h|hpp|s|S|ld|mk|cmake)$/i,
  includeContent: boolean = false
): Promise<BuildSnapshot> {
  const sourceFiles = findFilesByPattern(projectPath, filePattern);
  const snapshots: FileSnapshot[] = [];

  for (const filePath of sourceFiles) {
    const snapshot = await createFileSnapshot(filePath, projectPath, includeContent);
    if (snapshot) {
      snapshots.push(snapshot);
    }
  }

  return {
    buildId,
    projectPath,
    files: snapshots,
    createdAt: Date.now()
  };
}

export function analyzeFirmwareSections(firmwarePath: string): { text: number; data: number; bss: number } | null {
  try {
    const buffer = fs.readFileSync(firmwarePath);
    const ext = path.extname(firmwarePath).toLowerCase();

    if (ext === '.elf' || ext === '.axf') {
      return parseElfSections(buffer);
    }

    if (ext === '.bin') {
      const size = buffer.length;
      return {
        text: Math.floor(size * 0.7),
        data: Math.floor(size * 0.2),
        bss: Math.floor(size * 0.1)
      };
    }

    const size = buffer.length;
    return {
      text: Math.floor(size * 0.6),
      data: Math.floor(size * 0.25),
      bss: Math.floor(size * 0.15)
    };
  } catch (e) {
    console.warn('Failed to analyze firmware sections:', e);
    return null;
  }
}

function parseElfSections(buffer: Buffer): { text: number; data: number; bss: number } {
  try {
    const magic = buffer.readUInt32LE(0);
    if (magic !== 0x464c457f) {
      throw new Error('Not an ELF file');
    }

    const is64Bit = buffer[4] === 2;
    const eShOff = is64Bit ? buffer.readBigUInt64LE(40) : buffer.readUInt32LE(32);
    const eShentsize = is64Bit ? buffer.readUInt16LE(58) : buffer.readUInt16LE(46);
    const eShnum = is64Bit ? buffer.readUInt16LE(60) : buffer.readUInt16LE(48);
    const eShstrndx = is64Bit ? buffer.readUInt16LE(62) : buffer.readUInt16LE(50);

    const shstrTabOffset = Number(eShOff) + eShstrndx * eShentsize;
    let shName: number;
    if (is64Bit) {
      shName = buffer.readUInt32LE(shstrTabOffset);
      const shOffset = Number(buffer.readBigUInt64LE(shstrTabOffset + 24));
      const shSize = Number(buffer.readBigUInt64LE(shstrTabOffset + 32));
      const strTab = buffer.slice(shOffset, shOffset + shSize);
      
      let textSize = 0, dataSize = 0, bssSize = 0;
      
      for (let i = 0; i < eShnum; i++) {
        const shOffset2 = Number(eShOff) + i * eShentsize;
        const shNameIdx = buffer.readUInt32LE(shOffset2);
        const shSize2 = Number(buffer.readBigUInt64LE(shOffset2 + 32));
        const shType = buffer.readUInt32LE(shOffset2 + 4);
        const name = readCString(strTab, shNameIdx);
        
        if (name.includes('.text') || name.includes('.code')) {
          textSize += shSize2;
        } else if (name.includes('.data') || name.includes('.rodata')) {
          dataSize += shSize2;
        } else if (name.includes('.bss')) {
          bssSize += shSize2;
        }
      }
      
      return { text: textSize, data: dataSize, bss: bssSize };
    } else {
      shName = buffer.readUInt32LE(shstrTabOffset);
      const shOffset = buffer.readUInt32LE(shstrTabOffset + 16);
      const shSize = buffer.readUInt32LE(shstrTabOffset + 20);
      const strTab = buffer.slice(shOffset, shOffset + shSize);
      
      let textSize = 0, dataSize = 0, bssSize = 0;
      
      for (let i = 0; i < eShnum; i++) {
        const shOffset2 = Number(eShOff) + i * eShentsize;
        const shNameIdx = buffer.readUInt32LE(shOffset2);
        const shSize2 = buffer.readUInt32LE(shOffset2 + 20);
        const shType = buffer.readUInt32LE(shOffset2 + 4);
        const name = readCString(strTab, shNameIdx);
        
        if (name.includes('.text') || name.includes('.code')) {
          textSize += shSize2;
        } else if (name.includes('.data') || name.includes('.rodata')) {
          dataSize += shSize2;
        } else if (name.includes('.bss')) {
          bssSize += shSize2;
        }
      }
      
      return { text: textSize, data: dataSize, bss: bssSize };
    }
  } catch (e) {
    console.warn('ELF parse failed, using estimation:', e);
    const size = buffer.length;
    return {
      text: Math.floor(size * 0.6),
      data: Math.floor(size * 0.25),
      bss: Math.floor(size * 0.15)
    };
  }
}

function readCString(buffer: Buffer, offset: number): string {
  let end = offset;
  while (end < buffer.length && buffer[end] !== 0) {
    end++;
  }
  return buffer.slice(offset, end).toString('utf-8');
}

export function compareSnapshots(
  leftSnapshot: BuildSnapshot,
  rightSnapshot: BuildSnapshot
): {
  changes: FileChange[];
  totalLinesAdded: number;
  totalLinesDeleted: number;
} {
  const leftFiles = new Map(leftSnapshot.files.map(f => [f.path, f]));
  const rightFiles = new Map(rightSnapshot.files.map(f => [f.path, f]));
  const changes: FileChange[] = [];
  let totalLinesAdded = 0;
  let totalLinesDeleted = 0;

  for (const [filePath, rightFile] of rightFiles) {
    const leftFile = leftFiles.get(filePath);
    
    if (!leftFile) {
      changes.push({
        file: filePath,
        type: 'added',
        linesAdded: rightFile.lineCount,
        linesDeleted: 0
      });
      totalLinesAdded += rightFile.lineCount;
    } else if (leftFile.md5 !== rightFile.md5) {
      const linesAdded = Math.max(0, rightFile.lineCount - leftFile.lineCount);
      const linesDeleted = Math.max(0, leftFile.lineCount - rightFile.lineCount);
      changes.push({
        file: filePath,
        type: 'modified',
        linesAdded,
        linesDeleted
      });
      totalLinesAdded += linesAdded;
      totalLinesDeleted += linesDeleted;
    }
    
    leftFiles.delete(filePath);
  }

  for (const [filePath, leftFile] of leftFiles) {
    changes.push({
      file: filePath,
      type: 'deleted',
      linesAdded: 0,
      linesDeleted: leftFile.lineCount
    });
    totalLinesDeleted += leftFile.lineCount;
  }

  return { changes, totalLinesAdded, totalLinesDeleted };
}

export function compareFileContents(
  leftContent: string,
  rightContent: string
): { left: string; right: string; diff: { type: 'added' | 'deleted' | 'unchanged'; content: string; line: number }[] } {
  const leftLines = leftContent.split('\n');
  const rightLines = rightContent.split('\n');
  const diff: { type: 'added' | 'deleted' | 'unchanged'; content: string; line: number }[] = [];

  let i = 0, j = 0;
  
  while (i < leftLines.length && j < rightLines.length) {
    if (leftLines[i] === rightLines[j]) {
      diff.push({ type: 'unchanged', content: leftLines[i], line: i + 1 });
      i++;
      j++;
    } else {
      const maxLookahead = Math.min(5, leftLines.length - i, rightLines.length - j);
      let found = false;
      
      for (let k = 1; k <= maxLookahead; k++) {
        if (i + k < leftLines.length && leftLines[i + k] === rightLines[j]) {
          diff.push({ type: 'deleted', content: leftLines[i], line: i + 1 });
          i++;
          found = true;
          break;
        }
        if (j + k < rightLines.length && leftLines[i] === rightLines[j + k]) {
          diff.push({ type: 'added', content: rightLines[j], line: j + 1 });
          j++;
          found = true;
          break;
        }
      }
      
      if (!found) {
        diff.push({ type: 'deleted', content: leftLines[i], line: i + 1 });
        diff.push({ type: 'added', content: rightLines[j], line: j + 1 });
        i++;
        j++;
      }
    }
  }

  while (i < leftLines.length) {
    diff.push({ type: 'deleted', content: leftLines[i], line: i + 1 });
    i++;
  }

  while (j < rightLines.length) {
    diff.push({ type: 'added', content: rightLines[j], line: j + 1 });
    j++;
  }

  return { left: leftContent, right: rightContent, diff };
}

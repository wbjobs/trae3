import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { FileType } from '../../shared/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_UPLOAD_DIR = path.join(__dirname, '../../uploads');

export interface StoragePathInfo {
  dateDir: string;
  typeDir: string;
  projectDir: string;
  fileName: string;
  fullPath: string;
  relativePath: string;
}

export class FileStorageService {
  private baseDir: string;

  constructor() {
    this.baseDir = BASE_UPLOAD_DIR;
    this.ensureBaseDirectory();
  }

  private ensureBaseDirectory() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private ensureDirectory(dirPath: string) {
    const fullPath = path.join(this.baseDir, dirPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  }

  private getDateDir(date?: Date): string {
    const d = date || new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private getTypeDir(fileType: FileType | string): string {
    const typeMap: Record<string, string> = {
      DWG: 'cad-drawings',
      SHP: 'shapefiles',
      GDB: 'geo-databases',
      TIF: 'raster-images',
      OTHER: 'other-files'
    };
    return typeMap[fileType] || 'other-files';
  }

  private sanitizeDirName(name: string): string {
    return name.replace(/[<>:"/\\|?*]/g, '_').substring(0, 50);
  }

  generateFilePath(
    fileName: string,
    archiveId: string,
    options?: {
      fileType?: FileType | string;
      projectName?: string;
      date?: Date;
    }
  ): string {
    const dateDir = this.getDateDir(options?.date);
    const typeDir = this.getTypeDir(options?.fileType || 'OTHER');
    const projectDir = options?.projectName 
      ? this.sanitizeDirName(options.projectName)
      : 'uncategorized';
    
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const timestamp = Date.now();
    const safeFileName = `${baseName}_${archiveId.substring(0, 8)}_${timestamp}${ext}`;

    const relativeDir = path.join(dateDir, typeDir, projectDir);
    this.ensureDirectory(relativeDir);

    return path.join(relativeDir, safeFileName).replace(/\\/g, '/');
  }

  generateFilePathWithInfo(
    fileName: string,
    archiveId: string,
    options?: {
      fileType?: FileType | string;
      projectName?: string;
      date?: Date;
    }
  ): StoragePathInfo {
    const dateDir = this.getDateDir(options?.date);
    const typeDir = this.getTypeDir(options?.fileType || 'OTHER');
    const projectDir = options?.projectName 
      ? this.sanitizeDirName(options.projectName)
      : 'uncategorized';
    
    const ext = path.extname(fileName);
    const baseName = path.basename(fileName, ext);
    const timestamp = Date.now();
    const safeFileName = `${baseName}_${archiveId.substring(0, 8)}_${timestamp}${ext}`;

    const relativeDir = path.join(dateDir, typeDir, projectDir);
    const relativePath = path.join(relativeDir, safeFileName).replace(/\\/g, '/');
    const fullPath = path.join(this.baseDir, relativeDir, safeFileName);

    this.ensureDirectory(relativeDir);

    return {
      dateDir,
      typeDir,
      projectDir,
      fileName: safeFileName,
      fullPath,
      relativePath
    };
  }

  parseFilePath(relativePath: string): Partial<StoragePathInfo> | null {
    try {
      const parts = relativePath.split('/');
      if (parts.length >= 4) {
        return {
          dateDir: parts[0],
          typeDir: parts[1],
          projectDir: parts[2],
          fileName: parts.slice(3).join('/'),
          relativePath
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  getFileUrl(relativePath: string): string {
    return `/uploads/${relativePath}`;
  }

  getFullPath(relativePath: string): string {
    return path.join(this.baseDir, relativePath);
  }

  deleteFile(relativePath: string): boolean {
    const fullPath = this.getFullPath(relativePath);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
        this.cleanupEmptyDirs(path.dirname(relativePath));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  private cleanupEmptyDirs(relativeDir: string): void {
    const parts = relativeDir.split('/');
    while (parts.length > 0) {
      const currentDir = path.join(this.baseDir, ...parts);
      if (fs.existsSync(currentDir)) {
        const files = fs.readdirSync(currentDir);
        if (files.length === 0) {
          fs.rmdirSync(currentDir);
          parts.pop();
        } else {
          break;
        }
      } else {
        break;
      }
    }
  }

  getFileInfo(relativePath: string): {
    exists: boolean;
    size?: number;
    createdAt?: Date;
    pathInfo?: Partial<StoragePathInfo>;
  } {
    const fullPath = this.getFullPath(relativePath);
    if (fs.existsSync(fullPath)) {
      const stats = fs.statSync(fullPath);
      return {
        exists: true,
        size: stats.size,
        createdAt: stats.birthtime,
        pathInfo: this.parseFilePath(relativePath) || undefined
      };
    }
    return { exists: false };
  }

  getStorageStats(): {
    totalSize: number;
    fileCount: number;
    byDate: Record<string, { count: number; size: number }>;
    byType: Record<string, { count: number; size: number }>;
  } {
    const stats = {
      totalSize: 0,
      fileCount: 0,
      byDate: {} as Record<string, { count: number; size: number }>,
      byType: {} as Record<string, { count: number; size: number }>
    };

    function walkDir(dir: string, dateContext?: string, typeContext?: string) {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (!dateContext) {
            walkDir(fullPath, entry.name);
          } else if (!typeContext) {
            walkDir(fullPath, dateContext, entry.name);
          } else {
            walkDir(fullPath, dateContext, typeContext);
          }
        } else if (entry.isFile()) {
          const fileStats = fs.statSync(fullPath);
          stats.totalSize += fileStats.size;
          stats.fileCount++;

          if (dateContext) {
            if (!stats.byDate[dateContext]) {
              stats.byDate[dateContext] = { count: 0, size: 0 };
            }
            stats.byDate[dateContext].count++;
            stats.byDate[dateContext].size += fileStats.size;
          }

          if (typeContext) {
            if (!stats.byType[typeContext]) {
              stats.byType[typeContext] = { count: 0, size: 0 };
            }
            stats.byType[typeContext].count++;
            stats.byType[typeContext].size += fileStats.size;
          }
        }
      }
    }

    walkDir(this.baseDir);
    return stats;
  }

  listByDate(date: string): string[] {
    const dir = path.join(this.baseDir, date);
    if (!fs.existsSync(dir)) return [];
    
    const files: string[] = [];
    function walkDir(currentDir: string, relativePath: string) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(currentDir, entry.name);
        const entryRelative = path.join(relativePath, entry.name);
        if (entry.isDirectory()) {
          walkDir(entryPath, entryRelative);
        } else {
          files.push(entryRelative.replace(/\\/g, '/'));
        }
      }
    }
    walkDir(dir, date);
    return files;
  }

  listByType(fileType: FileType | string): string[] {
    const typeDir = this.getTypeDir(fileType);
    const files: string[] = [];
    
    if (!fs.existsSync(this.baseDir)) return files;
    
    const dateDirs = fs.readdirSync(this.baseDir, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dateDir of dateDirs) {
      const typePath = path.join(this.baseDir, dateDir, typeDir);
      if (fs.existsSync(typePath)) {
        function walkDir(currentDir: string, relativePath: string) {
          const entries = fs.readdirSync(currentDir, { withFileTypes: true });
          for (const entry of entries) {
            const entryPath = path.join(currentDir, entry.name);
            const entryRelative = path.join(relativePath, entry.name);
            if (entry.isDirectory()) {
              walkDir(entryPath, entryRelative);
            } else {
              files.push(entryRelative.replace(/\\/g, '/'));
            }
          }
        }
        walkDir(typePath, path.join(dateDir, typeDir));
      }
    }
    return files;
  }
}

export default new FileStorageService();

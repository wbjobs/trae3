import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { LocalFileInfo, LocalVersionRecord } from './types';
import { VersionDatabase } from './version-database';

export class LocalFileManager {
  private db: VersionDatabase;
  private workspacePath: string;

  constructor(db: VersionDatabase, workspacePath: string) {
    this.db = db;
    this.workspacePath = workspacePath;
  }

  async importFile(name: string, content: string, format: string = 'fanuc'): Promise<LocalFileInfo> {
    const id = uuidv4();
    const hash = this.computeHash(content);
    const now = new Date().toISOString();

    const fileInfo: LocalFileInfo = {
      id,
      name,
      path: path.join(this.workspacePath, name),
      size: Buffer.byteLength(content, 'utf-8'),
      hash,
      version: 1,
      format,
      lastModified: now,
      createdAt: now,
      tags: [],
      metadata: {},
    };

    const versionRecord: LocalVersionRecord = {
      id: uuidv4(),
      fileId: id,
      version: 1,
      hash,
      contentSnapshot: content,
      timestamp: now,
      author: 'local',
      deviceId: '',
      changeDescription: '初始导入',
    };

    this.db.updateFileAndInsertVersion(id, fileInfo, versionRecord);

    return fileInfo;
  }

  async saveFile(
    id: string,
    name: string,
    content: string,
    version: number,
    hash: string
  ): Promise<LocalFileInfo> {
    const existing = this.db.getFile(id);
    const now = new Date().toISOString();

    if (existing) {
      const parentVersion = existing.version;

      const fileUpdates: Partial<LocalFileInfo> = {
        name,
        hash,
        version,
        lastModified: now,
        size: Buffer.byteLength(content, 'utf-8'),
      };

      const versionRecord: LocalVersionRecord = {
        id: uuidv4(),
        fileId: id,
        version,
        hash,
        contentSnapshot: content,
        timestamp: now,
        author: 'sync',
        deviceId: '',
        changeDescription: '远程同步更新',
        parentVersion,
      };

      this.db.updateFileAndInsertVersion(id, fileUpdates, versionRecord);
      return this.db.getFile(id)!;
    } else {
      const fileInfo: LocalFileInfo = {
        id,
        name,
        path: path.join(this.workspacePath, name),
        size: Buffer.byteLength(content, 'utf-8'),
        hash,
        version,
        format: 'unknown',
        lastModified: now,
        createdAt: now,
        tags: [],
        metadata: {},
      };

      const versionRecord: LocalVersionRecord = {
        id: uuidv4(),
        fileId: id,
        version,
        hash,
        contentSnapshot: content,
        timestamp: now,
        author: 'sync',
        deviceId: '',
        changeDescription: '远程下载',
      };

      this.db.updateFileAndInsertVersion(id, fileInfo, versionRecord);
      return fileInfo;
    }
  }

  async updateFileContent(id: string, content: string, description: string = '内容更新'): Promise<LocalFileInfo> {
    const existing = this.db.getFile(id);
    if (!existing) throw new Error(`文件 ${id} 不存在`);

    const hash = this.computeHash(content);
    const now = new Date().toISOString();
    const newVersion = this.db.getNextVersion(id);

    const fileUpdates: Partial<LocalFileInfo> = {
      hash,
      version: newVersion,
      lastModified: now,
      size: Buffer.byteLength(content, 'utf-8'),
    };

    const versionRecord: LocalVersionRecord = {
      id: uuidv4(),
      fileId: id,
      version: newVersion,
      hash,
      contentSnapshot: content,
      timestamp: now,
      author: 'local',
      deviceId: '',
      changeDescription: description,
      parentVersion: existing.version,
    };

    this.db.updateFileAndInsertVersion(id, fileUpdates, versionRecord);

    return this.db.getFile(id)!;
  }

  async updateFileVersion(id: string, version: number, hash: string): Promise<void> {
    this.db.updateFile(id, { version, hash, lastModified: new Date().toISOString() });
  }

  async deleteFile(id: string): Promise<void> {
    this.db.deleteFile(id);
  }

  getFile(id: string): LocalFileInfo | null {
    return this.db.getFile(id);
  }

  listFiles(): LocalFileInfo[] {
    return this.db.listFiles();
  }

  async readFileContent(id: string): Promise<string> {
    const version = this.db.getLatestVersion(id);
    if (!version) throw new Error(`文件 ${id} 没有版本记录`);
    return version.contentSnapshot || '';
  }

  async readFileVersion(id: string, version: number): Promise<string> {
    const record = this.db.getVersion(id, version);
    if (!record) throw new Error(`文件 ${id} 版本 ${version} 不存在`);
    return record.contentSnapshot || '';
  }

  getFileVersions(id: string): LocalVersionRecord[] {
    return this.db.getVersions(id);
  }

  searchFiles(query: string, format?: string): LocalFileInfo[] {
    return this.db.searchFiles(query, format);
  }

  async addTag(id: string, tag: string): Promise<void> {
    const file = this.db.getFile(id);
    if (!file) throw new Error(`文件 ${id} 不存在`);
    if (!file.tags.includes(tag)) {
      file.tags.push(tag);
      this.db.updateFile(id, { tags: file.tags });
    }
  }

  async removeTag(id: string, tag: string): Promise<void> {
    const file = this.db.getFile(id);
    if (!file) throw new Error(`文件 ${id} 不存在`);
    file.tags = file.tags.filter(t => t !== tag);
    this.db.updateFile(id, { tags: file.tags });
  }

  async updateMetadata(id: string, key: string, value: string): Promise<void> {
    const file = this.db.getFile(id);
    if (!file) throw new Error(`文件 ${id} 不存在`);
    file.metadata[key] = value;
    this.db.updateFile(id, { metadata: file.metadata });
  }

  getStorageStats(): { totalFiles: number; totalSize: number; totalVersions: number } {
    return this.db.getStorageStats();
  }

  private computeHash(content: string): string {
    return createHash('sha256').update(content, 'utf-8').digest('hex');
  }
}

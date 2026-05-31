import initSqlJs, { Database, SqlJsStatic, SqlValue } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { Project, ProjectFile, VersionInfo, CacheEntry, AppConfig } from '../../shared/types';
import { generateId, generateVersion } from '../../shared/utils';

export class DatabaseManager {
  private db: Database;
  private SQL: SqlJsStatic;
  private dbPath: string;
  private static instance: DatabaseManager;
  private saveTimeout: NodeJS.Timeout | null = null;
  private closed: boolean = false;
  private versionCounter: number = 0;

  private constructor(SQL: SqlJsStatic, db: Database, dbPath: string) {
    this.SQL = SQL;
    this.db = db;
    this.dbPath = dbPath;
    this.db.run('PRAGMA foreign_keys = ON;');
    this.initializeTables();
    this.loadVersionCounter();
  }

  public static async getInstance(): Promise<DatabaseManager> {
    if (!DatabaseManager.instance) {
      const SQL = await initSqlJs({
        locateFile: (file: string) => path.join(__dirname, '../../node_modules/sql.js/dist', file)
      });
      
      const userDataPath = app.getPath('userData');
      if (!fs.existsSync(userDataPath)) {
        fs.mkdirSync(userDataPath, { recursive: true });
      }
      
      const dbPath = path.join(userDataPath, 'project-studio.db');
      let db: Database;
      
      try {
        if (fs.existsSync(dbPath)) {
          const fileBuffer = fs.readFileSync(dbPath);
          db = new SQL.Database(fileBuffer);
        } else {
          db = new SQL.Database();
        }
      } catch (error) {
        console.error('Failed to load database, creating new one:', error);
        const backupPath = dbPath + '.corrupted.' + Date.now();
        if (fs.existsSync(dbPath)) {
          try { fs.renameSync(dbPath, backupPath); } catch { }
        }
        db = new SQL.Database();
      }
      
      DatabaseManager.instance = new DatabaseManager(SQL, db, dbPath);
    }
    return DatabaseManager.instance;
  }

  private loadVersionCounter(): void {
    try {
      const stmt = this.db.prepare('SELECT MAX(created_at) as max_ts FROM versions');
      stmt.bind([]);
      if (stmt.step()) {
        const row = stmt.getAsObject() as any;
        if (row && row.max_ts) {
          this.versionCounter = row.max_ts;
        }
      }
      stmt.free();
    } catch {
      this.versionCounter = 0;
    }
  }

  private scheduleSave(): void {
    if (this.closed) return;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }
    this.saveTimeout = setTimeout(() => {
      this.saveToDisk();
    }, 500);
  }

  private saveToDisk(): void {
    if (this.closed) return;
    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      const tmpPath = this.dbPath + '.tmp';
      fs.writeFileSync(tmpPath, buffer);
      fs.renameSync(tmpPath, this.dbPath);
    } catch (error) {
      console.error('Failed to save database:', error);
    }
  }

  private initializeTables(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        version TEXT NOT NULL,
        cloud_id TEXT,
        is_synced INTEGER NOT NULL DEFAULT 0,
        last_synced_at INTEGER
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        language TEXT NOT NULL,
        size INTEGER NOT NULL,
        last_modified INTEGER NOT NULL,
        is_dirty INTEGER NOT NULL DEFAULT 0,
        version TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        version TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL,
        author TEXT NOT NULL,
        file_count INTEGER NOT NULL,
        size INTEGER NOT NULL,
        snapshot TEXT NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        expires_at INTEGER
      );
    `);
    this.db.run(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    this.db.run('CREATE INDEX IF NOT EXISTS idx_files_project_id ON files(project_id);');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_versions_project_id ON versions(project_id);');
    this.db.run('CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);');
    this.scheduleSave();
  }

  public createProject(name: string, description?: string): Project {
    const now = Date.now();
    const project: Project = {
      id: generateId(),
      name,
      description,
      files: [],
      createdAt: now,
      updatedAt: now,
      version: generateVersion(),
      isSynced: false,
    };

    this.db.run(
      `INSERT INTO projects (id, name, description, created_at, updated_at, version, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [project.id, project.name, project.description || null, project.createdAt,
       project.updatedAt, project.version, project.isSynced ? 1 : 0]
    );
    this.scheduleSave();

    return project;
  }

  public getProject(projectId: string): Project | null {
    const stmt = this.db.prepare('SELECT * FROM projects WHERE id = ?');
    stmt.bind([projectId]);
    let row: any = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    
    if (!row || !row.id) return null;

    const files = this.getProjectFiles(projectId);
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      files,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      version: row.version,
      cloudId: row.cloud_id || undefined,
      isSynced: row.is_synced === 1,
      lastSyncedAt: row.last_synced_at || undefined,
    };
  }

  public listProjects(): Project[] {
    const stmt = this.db.prepare('SELECT id FROM projects ORDER BY updated_at DESC');
    stmt.bind([]);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows.map(row => this.getProject(row.id)!).filter(Boolean);
  }

  public updateProject(projectId: string, updates: Partial<Project>): void {
    if (this.closed) return;
    const fields: string[] = [];
    const values: SqlValue[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      values.push(updates.description || null);
    }
    if (updates.updatedAt !== undefined) {
      fields.push('updated_at = ?');
      values.push(updates.updatedAt);
    }
    if (updates.version !== undefined) {
      fields.push('version = ?');
      values.push(updates.version);
    }
    if (updates.cloudId !== undefined) {
      fields.push('cloud_id = ?');
      values.push(updates.cloudId || null);
    }
    if (updates.isSynced !== undefined) {
      fields.push('is_synced = ?');
      values.push(updates.isSynced ? 1 : 0);
    }
    if (updates.lastSyncedAt !== undefined) {
      fields.push('last_synced_at = ?');
      values.push(updates.lastSyncedAt);
    }

    if (fields.length > 0) {
      values.push(projectId);
      this.db.run(`UPDATE projects SET ${fields.join(', ')} WHERE id = ?`, values);
      this.scheduleSave();
    }
  }

  public deleteProject(projectId: string): void {
    this.db.run('DELETE FROM files WHERE project_id = ?', [projectId]);
    this.db.run('DELETE FROM versions WHERE project_id = ?', [projectId]);
    this.db.run('DELETE FROM projects WHERE id = ?', [projectId]);
    this.scheduleSave();
  }

  public addFile(projectId: string, file: ProjectFile): void {
    this.db.run(
      `INSERT INTO files (id, project_id, name, file_path, content, language, size, last_modified, is_dirty, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [file.id, projectId, file.name, file.path, file.content,
       file.language, file.size, file.lastModified,
       file.isDirty ? 1 : 0, file.version || null]
    );
    this.updateProject(projectId, { updatedAt: Date.now() });
  }

  public updateFile(projectId: string, fileId: string, updates: Partial<ProjectFile>): void {
    if (this.closed) return;
    const fields: string[] = [];
    const values: SqlValue[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.path !== undefined) {
      fields.push('file_path = ?');
      values.push(updates.path);
    }
    if (updates.content !== undefined) {
      fields.push('content = ?');
      values.push(updates.content);
    }
    if (updates.language !== undefined) {
      fields.push('language = ?');
      values.push(updates.language);
    }
    if (updates.size !== undefined) {
      fields.push('size = ?');
      values.push(updates.size);
    }
    if (updates.lastModified !== undefined) {
      fields.push('last_modified = ?');
      values.push(updates.lastModified);
    }
    if (updates.isDirty !== undefined) {
      fields.push('is_dirty = ?');
      values.push(updates.isDirty ? 1 : 0);
    }
    if (updates.version !== undefined) {
      fields.push('version = ?');
      values.push(updates.version);
    }

    if (fields.length > 0) {
      values.push(fileId);
      this.db.run(`UPDATE files SET ${fields.join(', ')} WHERE id = ?`, values);
      this.updateProject(projectId, { updatedAt: Date.now() });
    }
  }

  public deleteFile(fileId: string, projectId: string): void {
    this.db.run('DELETE FROM files WHERE id = ?', [fileId]);
    this.updateProject(projectId, { updatedAt: Date.now() });
  }

  public getProjectFiles(projectId: string): ProjectFile[] {
    const stmt = this.db.prepare('SELECT * FROM files WHERE project_id = ? ORDER BY file_path');
    stmt.bind([projectId]);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      path: row.file_path,
      content: row.content,
      language: row.language,
      size: row.size,
      lastModified: row.last_modified,
      isDirty: row.is_dirty === 1,
      version: row.version || undefined,
    }));
  }

  public nextVersionNumber(): string {
    this.versionCounter = Math.max(this.versionCounter + 1, Date.now());
    return `v${this.versionCounter.toString(36)}`;
  }

  public createVersion(projectId: string, description: string, author: string): VersionInfo {
    const project = this.getProject(projectId);
    if (!project) throw new Error('Project not found');

    const versionStr = this.nextVersionNumber();
    const version: VersionInfo = {
      version: versionStr,
      description,
      createdAt: this.versionCounter,
      author,
      fileCount: project.files.length,
      size: project.files.reduce((sum, f) => sum + f.size, 0),
    };

    const snapshot = JSON.stringify(project.files);
    this.db.run(
      `INSERT INTO versions (id, project_id, version, description, created_at, author, file_count, size, snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [generateId(), projectId, version.version, description,
       version.createdAt, author, version.fileCount, version.size, snapshot]
    );

    this.updateProject(projectId, { version: version.version });
    return version;
  }

  public listVersions(projectId: string): VersionInfo[] {
    const stmt = this.db.prepare(
      `SELECT version, description, created_at, author, file_count, size
       FROM versions WHERE project_id = ? ORDER BY created_at DESC`
    );
    stmt.bind([projectId]);
    const rows: any[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows.map(row => ({
      version: row.version,
      description: row.description,
      createdAt: row.created_at,
      author: row.author,
      fileCount: row.file_count,
      size: row.size,
    }));
  }

  public rollbackToVersion(projectId: string, version: string): ProjectFile[] {
    const stmt = this.db.prepare('SELECT snapshot FROM versions WHERE project_id = ? AND version = ?');
    stmt.bind([projectId, version]);
    let row: any = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    
    if (!row || !row.snapshot) throw new Error('Version not found');

    const files: ProjectFile[] = JSON.parse(row.snapshot);
    this.db.run('DELETE FROM files WHERE project_id = ?', [projectId]);

    files.forEach(file => this.addFile(projectId, file));
    
    const newVersion = this.nextVersionNumber();
    this.updateProject(projectId, { version: newVersion, updatedAt: Date.now() });

    return files;
  }

  public getCache<T>(key: string): CacheEntry<T> | null {
    const now = Date.now();
    const stmt = this.db.prepare('SELECT * FROM cache WHERE key = ? AND (expires_at IS NULL OR expires_at > ?)');
    stmt.bind([key, now]);
    let row: any = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    
    if (!row || !row.key) return null;

    try {
      return {
        key: row.key,
        data: JSON.parse(row.data),
        timestamp: row.timestamp,
        expiresAt: row.expires_at || undefined,
      };
    } catch {
      return null;
    }
  }

  public setCache<T>(key: string, data: T, ttl?: number): void {
    const now = Date.now();
    const expiresAt = ttl ? now + ttl : undefined;

    this.db.run(
      `INSERT OR REPLACE INTO cache (key, data, timestamp, expires_at)
       VALUES (?, ?, ?, ?)`,
      [key, JSON.stringify(data), now, expiresAt || null]
    );
    this.scheduleSave();
  }

  public clearCache(key?: string): void {
    if (key) {
      this.db.run('DELETE FROM cache WHERE key = ?', [key]);
    } else {
      this.db.run('DELETE FROM cache');
    }
    this.scheduleSave();
  }

  public cleanupExpiredCache(): void {
    const now = Date.now();
    this.db.run('DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at <= ?', [now]);
    this.scheduleSave();
  }

  public getConfig(): AppConfig {
    const stmt = this.db.prepare('SELECT key, value FROM config');
    stmt.bind([]);
    const rows: { key: string; value: string }[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as { key: string; value: string });
    }
    stmt.free();
    
    const config: Record<string, string> = {};
    rows.forEach(row => config[row.key] = row.value);

    return {
      apiBaseUrl: config.apiBaseUrl || 'https://api.project-studio.com',
      cacheDir: config.cacheDir || path.join(app.getPath('userData'), 'cache'),
      autoSync: config.autoSync === 'true',
      syncInterval: parseInt(config.syncInterval || '300000'),
      theme: (config.theme as 'light' | 'dark') || 'dark',
      fontSize: parseInt(config.fontSize || '14'),
      tabSize: parseInt(config.tabSize || '2'),
      encryptionEnabled: config.encryptionEnabled === 'true',
      exportCompression: parseInt(config.exportCompression || '5'),
    };
  }

  public updateConfig(config: Partial<AppConfig>): void {
    const stmt = this.db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
    Object.entries(config).forEach(([key, value]) => {
      stmt.run([key, String(value)]);
    });
    stmt.free();
    this.scheduleSave();
  }

  public close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }
    try {
      this.saveToDisk();
      this.db.close();
    } catch (error) {
      console.error('Error closing database:', error);
    }
  }
}

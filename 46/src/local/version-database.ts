import Database from 'better-sqlite3';
import { LocalFileInfo, LocalVersionRecord } from './types';

export interface DeltaRecord {
  id: string;
  fileId: string;
  fromVersion: number;
  toVersion: number;
  delta: string;
  size: number;
  timestamp: string;
}

export interface VersionChainNode {
  version: number;
  hash: string;
  parent: number | null;
  timestamp: string;
}

export interface BatchInsertResult {
  success: number;
  failed: number;
  errors: Array<{ index: number; error: string }>;
}

export class VersionDatabase {
  private db: Database.Database;
  private stmtCache: Map<string, Database.Statement> = new Map();

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('mmap_size = 30000000000');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL,
        size INTEGER DEFAULT 0,
        hash TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        format TEXT DEFAULT 'fanuc',
        last_modified TEXT NOT NULL,
        created_at TEXT NOT NULL,
        tags TEXT DEFAULT '[]',
        metadata TEXT DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        hash TEXT NOT NULL,
        content_snapshot TEXT,
        timestamp TEXT NOT NULL,
        author TEXT DEFAULT '',
        device_id TEXT DEFAULT '',
        change_description TEXT DEFAULT '',
        parent_version INTEGER,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
        UNIQUE(file_id, version)
      );

      CREATE TABLE IF NOT EXISTS version_deltas (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        from_version INTEGER NOT NULL,
        to_version INTEGER NOT NULL,
        delta TEXT NOT NULL,
        delta_size INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
        UNIQUE(file_id, from_version, to_version)
      );

      CREATE TABLE IF NOT EXISTS gc_stats (
        id INTEGER PRIMARY KEY,
        last_gc_time TEXT,
        total_freed_bytes INTEGER DEFAULT 0,
        total_versions_pruned INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_files_name ON files(name);
      CREATE INDEX IF NOT EXISTS idx_files_format ON files(format);
      CREATE INDEX IF NOT EXISTS idx_files_modified ON files(last_modified);
      CREATE INDEX IF NOT EXISTS idx_versions_file_id ON versions(file_id);
      CREATE INDEX IF NOT EXISTS idx_versions_timestamp ON versions(timestamp);
      CREATE INDEX IF NOT EXISTS idx_versions_file_version ON versions(file_id, version);
      CREATE INDEX IF NOT EXISTS idx_deltas_file ON version_deltas(file_id);
      CREATE INDEX IF NOT EXISTS idx_deltas_version_range ON version_deltas(file_id, from_version, to_version);

      INSERT OR IGNORE INTO gc_stats (id, last_gc_time) VALUES (1, '');
    `);
  }

  private stmt(sql: string): Database.Statement {
    if (!this.stmtCache.has(sql)) {
      this.stmtCache.set(sql, this.db.prepare(sql));
    }
    return this.stmtCache.get(sql)!;
  }

  insertFile(file: LocalFileInfo): void {
    const tx = this.db.transaction(() => {
      const stmt = this.stmt(`
        INSERT INTO files (id, name, path, size, hash, version, format, last_modified, created_at, tags, metadata)
        VALUES (@id, @name, @path, @size, @hash, @version, @format, @lastModified, @createdAt, @tags, @metadata)
      `);
      stmt.run({
        ...file,
        tags: JSON.stringify(file.tags),
        metadata: JSON.stringify(file.metadata),
      });
    });
    tx();
  }

  getFile(id: string): LocalFileInfo | null {
    const stmt = this.stmt('SELECT * FROM files WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;
    return this.rowToFile(row);
  }

  listFiles(offset: number = 0, limit: number = 100): LocalFileInfo[] {
    const stmt = this.stmt(
      'SELECT * FROM files ORDER BY last_modified DESC LIMIT ? OFFSET ?'
    );
    return (stmt.all(limit, offset) as any[]).map(row => this.rowToFile(row));
  }

  listAllFiles(): LocalFileInfo[] {
    const stmt = this.stmt('SELECT * FROM files ORDER BY last_modified DESC');
    return (stmt.all() as any[]).map(row => this.rowToFile(row));
  }

  updateFile(id: string, updates: Partial<LocalFileInfo>): void {
    const fields: string[] = [];
    const values: any = { id };

    for (const [key, value] of Object.entries(updates)) {
      if (key === 'id') continue;
      const dbKey = key.replace(/([A-Z])/g, '_$1').toLowerCase();
      fields.push(`${dbKey} = @${key}`);
      values[key] = key === 'tags' ? JSON.stringify(value) : key === 'metadata' ? JSON.stringify(value) : value;
    }

    if (fields.length === 0) return;

    const sql = `UPDATE files SET ${fields.join(', ')} WHERE id = @id`;
    const stmt = this.db.prepare(sql);
    stmt.run(values);
  }

  batchUpdateFiles(updates: Array<{ id: string; updates: Partial<LocalFileInfo> }>): BatchInsertResult {
    let success = 0;
    const errors: Array<{ index: number; error: string }> = [];

    const tx = this.db.transaction(() => {
      for (let i = 0; i < updates.length; i++) {
        try {
          this.updateFile(updates[i].id, updates[i].updates);
          success++;
        } catch (err) {
          errors.push({ index: i, error: (err as Error).message });
        }
      }
    });
    tx();

    return { success, failed: updates.length - success, errors };
  }

  deleteFile(id: string): void {
    const tx = this.db.transaction(() => {
      const delDeltas = this.stmt('DELETE FROM version_deltas WHERE file_id = ?');
      delDeltas.run(id);
      const delVersions = this.stmt('DELETE FROM versions WHERE file_id = ?');
      delVersions.run(id);
      const delFile = this.stmt('DELETE FROM files WHERE id = ?');
      delFile.run(id);
    });
    tx();
  }

  batchDeleteFiles(ids: string[]): BatchInsertResult {
    let success = 0;
    const errors: Array<{ index: number; error: string }> = [];

    const tx = this.db.transaction(() => {
      for (let i = 0; i < ids.length; i++) {
        try {
          this.deleteFile(ids[i]);
          success++;
        } catch (err) {
          errors.push({ index: i, error: (err as Error).message });
        }
      }
    });
    tx();

    return { success, failed: ids.length - success, errors };
  }

  insertVersion(version: LocalVersionRecord): void {
    const stmt = this.stmt(`
      INSERT INTO versions (id, file_id, version, hash, content_snapshot, timestamp, author, device_id, change_description, parent_version)
      VALUES (@id, @fileId, @version, @hash, @contentSnapshot, @timestamp, @author, @deviceId, @changeDescription, @parentVersion)
    `);
    stmt.run({
      id: version.id,
      file_id: version.fileId,
      version: version.version,
      hash: version.hash,
      content_snapshot: version.contentSnapshot,
      timestamp: version.timestamp,
      author: version.author,
      device_id: version.deviceId,
      change_description: version.changeDescription,
      parent_version: version.parentVersion,
    });
  }

  insertVersionWithDelta(
    version: LocalVersionRecord,
    parentContent: string | null,
    currentContent: string
  ): void {
    const tx = this.db.transaction(() => {
      this.insertVersion(version);

      if (parentContent && version.parentVersion) {
        const delta = this.computeDelta(parentContent, currentContent);
        const deltaStmt = this.stmt(`
          INSERT INTO version_deltas (id, file_id, from_version, to_version, delta, delta_size, timestamp)
          VALUES (@id, @fileId, @fromVersion, @toVersion, @delta, @deltaSize, @timestamp)
        `);
        deltaStmt.run({
          id: `${version.fileId}-${version.parentVersion}-${version.version}`,
          fileId: version.fileId,
          fromVersion: version.parentVersion,
          toVersion: version.version,
          delta,
          deltaSize: Buffer.byteLength(delta, 'utf8'),
          timestamp: version.timestamp,
        });
      }
    });
    tx();
  }

  updateFileAndInsertVersion(
    fileId: string,
    fileUpdates: Partial<LocalFileInfo>,
    versionRecord: LocalVersionRecord,
    previousContent?: string,
    newContent?: string
  ): void {
    const tx = this.db.transaction(() => {
      this.updateFile(fileId, fileUpdates);
      if (previousContent && newContent) {
        this.insertVersionWithDelta(versionRecord, previousContent, newContent);
      } else {
        this.insertVersion(versionRecord);
      }
    });
    tx();
  }

  private computeDelta(from: string, to: string): string {
    const fromLines = from.split('\n');
    const toLines = to.split('\n');
    const ops: string[] = [];

    const fromSet = new Set(fromLines);
    const toSet = new Set(toLines);

    for (let i = 0; i < toLines.length; i++) {
      if (!fromSet.has(toLines[i])) {
        ops.push(`+${i}:${toLines[i]}`);
      }
    }

    for (let i = 0; i < fromLines.length; i++) {
      if (!toSet.has(fromLines[i])) {
        ops.push(`-${i}:${fromLines[i]}`);
      }
    }

    return ops.join('\n');
  }

  private applyDelta(base: string, delta: string): string {
    const lines = base.split('\n');
    const ops = delta.split('\n');
    const insertions: Array<{ index: number; text: string }> = [];
    const deletions: number[] = [];

    for (const op of ops) {
      if (!op) continue;
      const firstColon = op.indexOf(':');
      if (firstColon === -1) continue;

      const type = op[0];
      const idx = parseInt(op.substring(1, firstColon));
      const text = op.substring(firstColon + 1);

      if (type === '+') {
        insertions.push({ index: idx, text });
      } else if (type === '-') {
        deletions.push(idx);
      }
    }

    for (const idx of deletions.sort((a, b) => b - a)) {
      if (idx < lines.length) {
        lines.splice(idx, 1);
      }
    }

    for (const ins of insertions.sort((a, b) => b.index - a.index)) {
      lines.splice(ins.index, 0, ins.text);
    }

    return lines.join('\n');
  }

  getVersionContent(fileId: string, version: number): string | null {
    const ver = this.getVersion(fileId, version);
    if (!ver) return null;
    if (ver.contentSnapshot) return ver.contentSnapshot;

    let currentVer = version;
    let content = '';
    const appliedDeltas: DeltaRecord[] = [];

    while (currentVer > 1) {
      const delta = this.getDelta(fileId, currentVer - 1, currentVer);
      if (delta) {
        appliedDeltas.push(delta);
        currentVer--;
      } else {
        const baseVer = this.getVersion(fileId, currentVer);
        if (baseVer?.contentSnapshot) {
          content = baseVer.contentSnapshot;
          break;
        }
        break;
      }
    }

    if (!content) {
      const baseVer = this.getVersion(fileId, currentVer);
      content = baseVer?.contentSnapshot || '';
    }

    for (const delta of appliedDeltas.reverse()) {
      content = this.applyDelta(content, delta.delta);
    }

    return content;
  }

  getDelta(fileId: string, fromVersion: number, toVersion: number): DeltaRecord | null {
    const stmt = this.stmt(
      'SELECT * FROM version_deltas WHERE file_id = ? AND from_version = ? AND to_version = ?'
    );
    const row = stmt.get(fileId, fromVersion, toVersion) as any;
    if (!row) return null;
    return {
      id: row.id,
      fileId: row.file_id,
      fromVersion: row.from_version,
      toVersion: row.to_version,
      delta: row.delta,
      size: row.delta_size,
      timestamp: row.timestamp,
    };
  }

  getDeltaChain(fileId: string, fromVersion: number, toVersion: number): DeltaRecord[] {
    const stmt = this.stmt(`
      SELECT * FROM version_deltas
      WHERE file_id = ? AND from_version >= ? AND to_version <= ?
      ORDER BY from_version ASC
    `);
    return (stmt.all(fileId, fromVersion, toVersion) as any[]).map((row: any) => ({
      id: row.id,
      fileId: row.file_id,
      fromVersion: row.from_version,
      toVersion: row.to_version,
      delta: row.delta,
      size: row.delta_size,
      timestamp: row.timestamp,
    }));
  }

  getVersionChain(fileId: string): VersionChainNode[] {
    const stmt = this.stmt(
      'SELECT version, hash, parent_version, timestamp FROM versions WHERE file_id = ? ORDER BY version ASC'
    );
    return (stmt.all(fileId) as any[]).map((row: any) => ({
      version: row.version,
      hash: row.hash,
      parent: row.parent_version,
      timestamp: row.timestamp,
    }));
  }

  getNextVersion(fileId: string): number {
    const stmt = this.stmt(
      'SELECT MAX(version) as maxVersion FROM versions WHERE file_id = ?'
    );
    const row = stmt.get(fileId) as any;
    return (row?.maxVersion || 0) + 1;
  }

  getVersions(fileId: string): LocalVersionRecord[] {
    const stmt = this.stmt(
      'SELECT id, file_id, version, hash, timestamp, author, device_id, change_description, parent_version FROM versions WHERE file_id = ? ORDER BY version DESC'
    );
    return (stmt.all(fileId) as any[]).map(row => this.rowToVersionLight(row));
  }

  getVersion(fileId: string, version: number): LocalVersionRecord | null {
    const stmt = this.stmt(
      'SELECT * FROM versions WHERE file_id = ? AND version = ?'
    );
    const row = stmt.get(fileId, version) as any;
    return row ? this.rowToVersion(row) : null;
  }

  getLatestVersion(fileId: string): LocalVersionRecord | null {
    const stmt = this.stmt(
      'SELECT * FROM versions WHERE file_id = ? ORDER BY version DESC LIMIT 1'
    );
    const row = stmt.get(fileId) as any;
    return row ? this.rowToVersion(row) : null;
  }

  searchFiles(query: string, format?: string, offset: number = 0, limit: number = 50): LocalFileInfo[] {
    let sql = 'SELECT * FROM files WHERE name LIKE ?';
    const params: any[] = [`%${query}%`];

    if (format) {
      sql += ' AND format = ?';
      params.push(format);
    }

    sql += ' ORDER BY last_modified DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = this.db.prepare(sql);
    return (stmt.all(...params) as any[]).map(row => this.rowToFile(row));
  }

  getFileCount(): number {
    const stmt = this.stmt('SELECT COUNT(*) as count FROM files');
    return (stmt.get() as any).count;
  }

  pruneOldVersions(fileId: string, keepCount: number = 50): { pruned: number; freedBytes: number } {
    const versions = this.getVersions(fileId);
    if (versions.length <= keepCount) return { pruned: 0, freedBytes: 0 };

    const toPrune = versions.slice(keepCount);
    let freedBytes = 0;

    const tx = this.db.transaction(() => {
      for (const ver of toPrune) {
        const fullVer = this.getVersion(fileId, ver.version);
        if (fullVer?.contentSnapshot) {
          freedBytes += Buffer.byteLength(fullVer.contentSnapshot, 'utf8');
        }

        this.stmt('UPDATE versions SET content_snapshot = NULL WHERE id = ?').run(ver.id);
      }

      this.stmt('DELETE FROM version_deltas WHERE file_id = ? AND to_version <= ?')
        .run(fileId, toPrune[0].version);
    });
    tx();

    this.updateGcStats(toPrune.length, freedBytes);

    return { pruned: toPrune.length, freedBytes };
  }

  pruneAllOldVersions(keepCount: number = 50): { pruned: number; freedBytes: number } {
    const files = this.listAllFiles();
    let totalPruned = 0;
    let totalFreed = 0;

    for (const file of files) {
      const result = this.pruneOldVersions(file.id, keepCount);
      totalPruned += result.pruned;
      totalFreed += result.freedBytes;
    }

    return { pruned: totalPruned, freedBytes: totalFreed };
  }

  vacuum(): { beforeSize: number; afterSize: number; freed: number } {
    const before = this.getDbSize();
    this.db.exec('VACUUM');
    const after = this.getDbSize();
    return { beforeSize: before, afterSize: after, freed: before - after };
  }

  private getDbSize(): number {
    const stmt = this.stmt('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()');
    const result = stmt.get() as any;
    return result?.size || 0;
  }

  private updateGcStats(versionsPruned: number, bytesFreed: number): void {
    const stmt = this.stmt(`
      UPDATE gc_stats SET
        last_gc_time = ?,
        total_versions_pruned = total_versions_pruned + ?,
        total_freed_bytes = total_freed_bytes + ?
      WHERE id = 1
    `);
    stmt.run(new Date().toISOString(), versionsPruned, bytesFreed);
  }

  getGcStats(): { lastGcTime: string; totalFreedBytes: number; totalVersionsPruned: number } {
    const stmt = this.stmt('SELECT * FROM gc_stats WHERE id = 1');
    const row = stmt.get() as any;
    return {
      lastGcTime: row?.last_gc_time || '',
      totalFreedBytes: row?.total_freed_bytes || 0,
      totalVersionsPruned: row?.total_versions_pruned || 0,
    };
  }

  getStorageStats(): { totalFiles: number; totalSize: number; totalVersions: number; deltaSize: number; dbSize: number } {
    const fileStats = this.stmt(
      'SELECT COUNT(*) as totalFiles, COALESCE(SUM(size), 0) as totalSize FROM files'
    ).get() as any;
    const versionStats = this.stmt(
      'SELECT COUNT(*) as totalVersions FROM versions'
    ).get() as any;
    const deltaStats = this.stmt(
      'SELECT COALESCE(SUM(delta_size), 0) as deltaSize FROM version_deltas'
    ).get() as any;

    return {
      totalFiles: fileStats.totalFiles,
      totalSize: fileStats.totalSize,
      totalVersions: versionStats.totalVersions,
      deltaSize: deltaStats.deltaSize,
      dbSize: this.getDbSize(),
    };
  }

  private rowToFile(row: any): LocalFileInfo {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      size: row.size,
      hash: row.hash,
      version: row.version,
      format: row.format,
      lastModified: row.last_modified,
      createdAt: row.created_at,
      tags: JSON.parse(row.tags || '[]'),
      metadata: JSON.parse(row.metadata || '{}'),
    };
  }

  private rowToVersion(row: any): LocalVersionRecord {
    return {
      id: row.id,
      fileId: row.file_id,
      version: row.version,
      hash: row.hash,
      contentSnapshot: row.content_snapshot,
      timestamp: row.timestamp,
      author: row.author,
      deviceId: row.device_id,
      changeDescription: row.change_description,
      parentVersion: row.parent_version,
    };
  }

  private rowToVersionLight(row: any): LocalVersionRecord {
    return {
      id: row.id,
      fileId: row.file_id,
      version: row.version,
      hash: row.hash,
      contentSnapshot: undefined,
      timestamp: row.timestamp,
      author: row.author,
      deviceId: row.device_id,
      changeDescription: row.change_description,
      parentVersion: row.parent_version,
    };
  }

  close(): void {
    this.stmtCache.clear();
    this.db.close();
  }
}

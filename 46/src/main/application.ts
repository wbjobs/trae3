import { GCodeParser, CNCFormat, FORMAT_PROFILES } from '../parser';
import { FormatConverter } from '../converter';
import { SyncEngine, SyncConfig } from '../sync';
import { LocalFileManager, VersionDatabase, ConfigManager, AppConfig, DEFAULT_CONFIG } from '../local';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

export class Application {
  private configManager!: ConfigManager;
  private versionDb!: VersionDatabase;
  private fileManager!: LocalFileManager;
  private syncEngine!: SyncEngine;
  private dataDir: string;

  constructor() {
    this.dataDir = path.join(os.homedir(), '.cnc-program-manager');
  }

  async initialize(): Promise<void> {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.configManager = new ConfigManager();

    const dbPath = path.join(this.dataDir, 'versions.db');
    this.versionDb = new VersionDatabase(dbPath);

    const config = this.configManager.getConfig();
    const workspacePath = config.general.workspace || path.join(this.dataDir, 'workspace');
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }

    this.fileManager = new LocalFileManager(this.versionDb, workspacePath);

    if (config.sync.enabled) {
      const syncConfig: SyncConfig = {
        serverUrl: config.sync.serverUrl,
        apiKey: config.sync.apiKey,
        deviceId: config.sync.deviceId || uuidv4(),
        syncInterval: config.sync.syncInterval,
        conflictStrategy: config.sync.conflictStrategy,
        autoSync: config.sync.autoSync,
      };
      this.syncEngine = new SyncEngine(syncConfig, this.fileManager);
    }
  }

  async shutdown(): Promise<void> {
    if (this.syncEngine) {
      this.syncEngine.stop();
    }
    if (this.versionDb) {
      this.versionDb.close();
    }
  }

  parseProgram(content: string, format: string) {
    const cncFormat = CNCFormat[format.toUpperCase() as keyof typeof CNCFormat] || CNCFormat.FANUC;
    const parser = new GCodeParser(cncFormat);
    const result = parser.parse(content);
    const errors = parser.validate(result);

    return {
      header: {
        ...result.header,
        format: result.header.format,
      },
      commands: result.commands.map(cmd => ({
        ...cmd,
        parameters: Object.fromEntries(cmd.parameters),
      })),
      errors,
      metadata: result.metadata,
    };
  }

  validateProgram(content: string, format: string) {
    const cncFormat = CNCFormat[format.toUpperCase() as keyof typeof CNCFormat] || CNCFormat.FANUC;
    const parser = new GCodeParser(cncFormat);
    const result = parser.parse(content);
    return parser.validate(result);
  }

  convertFormat(content: string, sourceFormat: string, targetFormat: string) {
    const srcFormat = CNCFormat[sourceFormat.toUpperCase() as keyof typeof CNCFormat] || CNCFormat.FANUC;
    const tgtFormat = CNCFormat[targetFormat.toUpperCase() as keyof typeof CNCFormat] || CNCFormat.FANUC;

    const parser = new GCodeParser(srcFormat);
    const parsed = parser.parse(content);

    const converter = new FormatConverter({
      sourceFormat: srcFormat,
      targetFormat: tgtFormat,
      preserveComments: true,
      prettyPrint: true,
      lineNumbers: false,
      indentSize: 2,
    });

    return converter.convert(parsed);
  }

  async importFile(name: string, content: string, format: string) {
    return this.fileManager.importFile(name, content, format);
  }

  listFiles() {
    return this.fileManager.listFiles();
  }

  getFile(id: string) {
    return this.fileManager.getFile(id);
  }

  async readFileContent(id: string) {
    return this.fileManager.readFileContent(id);
  }

  async readFileVersion(id: string, version: number) {
    return this.fileManager.readFileVersion(id, version);
  }

  async updateFileContent(id: string, content: string, description: string) {
    return this.fileManager.updateFileContent(id, content, description);
  }

  async deleteFile(id: string) {
    return this.fileManager.deleteFile(id);
  }

  getFileVersions(id: string) {
    return this.fileManager.getFileVersions(id);
  }

  searchFiles(query: string, format?: string) {
    return this.fileManager.searchFiles(query, format);
  }

  async startSync() {
    if (!this.syncEngine) {
      const config = this.configManager.getConfig();
      const syncConfig: SyncConfig = {
        serverUrl: config.sync.serverUrl,
        apiKey: config.sync.apiKey,
        deviceId: config.sync.deviceId || uuidv4(),
        syncInterval: config.sync.syncInterval,
        conflictStrategy: config.sync.conflictStrategy,
        autoSync: config.sync.autoSync,
      };
      this.syncEngine = new SyncEngine(syncConfig, this.fileManager);
    }
    await this.syncEngine.start();
  }

  stopSync() {
    if (this.syncEngine) {
      this.syncEngine.stop();
    }
  }

  getSyncStatus() {
    return this.syncEngine ? this.syncEngine.getStatus() : null;
  }

  async resolveConflict(conflictId: string, resolution: 'local' | 'remote' | 'merge') {
    if (!this.syncEngine) throw new Error('同步未启动');
    return this.syncEngine.resolveConflict(conflictId, resolution);
  }

  getConfig(): AppConfig {
    return this.configManager.getConfig();
  }

  updateConfig(updates: Partial<AppConfig>) {
    this.configManager.updateConfig(updates);
    return this.configManager.getConfig();
  }

  resetConfig() {
    this.configManager.resetToDefaults();
    return this.configManager.getConfig();
  }

  getStorageStats() {
    return this.fileManager.getStorageStats();
  }
}

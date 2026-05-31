export interface LocalFileInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  hash: string;
  version: number;
  format: string;
  lastModified: string;
  createdAt: string;
  tags: string[];
  metadata: Record<string, string>;
}

export interface LocalVersionRecord {
  id: string;
  fileId: string;
  version: number;
  hash: string;
  contentSnapshot?: string;
  timestamp: string;
  author: string;
  deviceId: string;
  changeDescription: string;
  parentVersion?: number;
}

export interface AppConfig {
  general: GeneralConfig;
  parser: ParserConfig;
  converter: ConverterConfig;
  sync: SyncConfigLocal;
  ui: UIConfig;
}

export interface GeneralConfig {
  language: 'zh-CN' | 'en-US';
  workspace: string;
  autoSave: boolean;
  autoSaveInterval: number;
  backupCount: number;
  fileWatchEnabled: boolean;
}

export interface ParserConfig {
  defaultFormat: string;
  strictMode: boolean;
  autoDetectFormat: boolean;
  maxFileSize: number;
}

export interface ConverterConfig {
  preserveComments: boolean;
  prettyPrint: boolean;
  lineNumbers: boolean;
  customMappings: Record<string, string>;
}

export interface SyncConfigLocal {
  enabled: boolean;
  serverUrl: string;
  apiKey: string;
  deviceId: string;
  syncInterval: number;
  conflictStrategy: 'local-wins' | 'remote-wins' | 'manual';
  autoSync: boolean;
}

export interface UIConfig {
  theme: 'light' | 'dark' | 'system';
  fontSize: number;
  showLineNumbers: boolean;
  wrapLines: boolean;
  sidebarWidth: number;
}

export interface SearchResult {
  files: LocalFileInfo[];
  total: number;
  query: string;
}

export const DEFAULT_CONFIG: AppConfig = {
  general: {
    language: 'zh-CN',
    workspace: '',
    autoSave: true,
    autoSaveInterval: 30,
    backupCount: 10,
    fileWatchEnabled: true,
  },
  parser: {
    defaultFormat: 'fanuc',
    strictMode: false,
    autoDetectFormat: true,
    maxFileSize: 10 * 1024 * 1024,
  },
  converter: {
    preserveComments: true,
    prettyPrint: true,
    lineNumbers: false,
    customMappings: {},
  },
  sync: {
    enabled: false,
    serverUrl: 'http://localhost:8080',
    apiKey: '',
    deviceId: '',
    syncInterval: 300,
    conflictStrategy: 'manual',
    autoSync: false,
  },
  ui: {
    theme: 'system',
    fontSize: 14,
    showLineNumbers: true,
    wrapLines: false,
    sidebarWidth: 280,
  },
};

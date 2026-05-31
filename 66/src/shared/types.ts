export interface ProjectFile {
  id: string;
  name: string;
  path: string;
  content: string;
  language: string;
  size: number;
  lastModified: number;
  isDirty?: boolean;
  version?: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  files: ProjectFile[];
  createdAt: number;
  updatedAt: number;
  version: string;
  cloudId?: string;
  isSynced: boolean;
  lastSyncedAt?: number;
  isEncrypted?: boolean;
  encryptionSalt?: string;
}

export interface ValidationResult {
  fileId: string;
  filePath: string;
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  timestamp: number;
}

export interface ValidationError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  ruleId?: string;
}

export interface SyncStatus {
  status: 'idle' | 'syncing' | 'success' | 'error';
  progress: number;
  message?: string;
  lastSyncTime?: number;
}

export interface CloudProject {
  id: string;
  name: string;
  description: string;
  owner: string;
  createdAt: number;
  updatedAt: number;
  version: string;
  versions: VersionInfo[];
  isPublic: boolean;
}

export interface VersionInfo {
  version: string;
  description: string;
  createdAt: number;
  author: string;
  fileCount: number;
  size: number;
}

export interface CacheEntry<T> {
  key: string;
  data: T;
  timestamp: number;
  expiresAt?: number;
}

export interface AppConfig {
  apiBaseUrl: string;
  cacheDir: string;
  autoSync: boolean;
  syncInterval: number;
  theme: 'light' | 'dark';
  fontSize: number;
  tabSize: number;
  encryptionEnabled: boolean;
  exportCompression: number;
}

export interface EncryptionConfig {
  enabled: boolean;
  algorithm: 'AES-256-GCM';
  iterations: number;
}

export interface ExportOptions {
  compress: boolean;
  compressionLevel: number;
  includeVersions: boolean;
  includeCache: boolean;
  encrypt: boolean;
  password?: string;
}

export interface ExportProgress {
  status: 'idle' | 'exporting' | 'encrypting' | 'compressing' | 'done' | 'error';
  progress: number;
  totalFiles: number;
  processedFiles: number;
  message: string;
}

export interface IPCResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export enum IPCChannel {
  PROJECT_NEW = 'project:new',
  PROJECT_OPEN = 'project:open',
  PROJECT_SAVE = 'project:save',
  PROJECT_CLOSE = 'project:close',
  PROJECT_DELETE = 'project:delete',
  PROJECT_LIST = 'project:list',
  PROJECT_ENCRYPT = 'project:encrypt',
  PROJECT_DECRYPT = 'project:decrypt',
  PROJECT_EXPORT = 'project:export',
  PROJECT_IMPORT = 'project:import',
  PROJECT_BATCH_EXPORT = 'project:batch-export',
  FILE_READ = 'file:read',
  FILE_WRITE = 'file:write',
  FILE_DELETE = 'file:delete',
  FILE_RENAME = 'file:rename',
  VALIDATE_FILE = 'validate:file',
  VALIDATE_PROJECT = 'validate:project',
  SYNC_START = 'sync:start',
  SYNC_STATUS = 'sync:status',
  SYNC_PUSH = 'sync:push',
  SYNC_PULL = 'sync:pull',
  CLOUD_LIST = 'cloud:list',
  CLOUD_GET = 'cloud:get',
  CLOUD_CREATE = 'cloud:create',
  CLOUD_DELETE = 'cloud:delete',
  CACHE_GET = 'cache:get',
  CACHE_SET = 'cache:set',
  CACHE_CLEAR = 'cache:clear',
  VERSION_LIST = 'version:list',
  VERSION_CREATE = 'version:create',
  VERSION_ROLLBACK = 'version:rollback',
  CONFIG_GET = 'config:get',
  CONFIG_SET = 'config:set',
  DIALOG_SAVE = 'dialog:save',
  DIALOG_OPEN = 'dialog:open',
}

export const SupportedLanguages: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.py': 'python',
  '.java': 'java',
  '.cpp': 'cpp',
  '.c': 'c',
  '.cs': 'csharp',
  '.go': 'go',
  '.rs': 'rust',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.json': 'json',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bat': 'bat',
};

export const LanguageExtensions: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx'],
  python: ['.py'],
  java: ['.java'],
  cpp: ['.cpp', '.c', '.h', '.hpp'],
  csharp: ['.cs'],
  go: ['.go'],
  rust: ['.rs'],
  html: ['.html'],
  css: ['.css', '.scss', '.less'],
  json: ['.json'],
  yaml: ['.yaml', '.yml'],
  markdown: ['.md'],
  sql: ['.sql'],
  shell: ['.sh', '.bash'],
  bat: ['.bat', '.cmd'],
};

export interface ThemeColors {
  background: string;
  backgroundSecondary: string;
  backgroundTertiary: string;
  foreground: string;
  foregroundSecondary: string;
  foregroundMuted: string;
  border: string;
  borderHover: string;
  accent: string;
  accentHover: string;
  success: string;
  warning: string;
  error: string;
  errorBackground: string;
}

export const DarkTheme: ThemeColors = {
  background: '#1e1e1e',
  backgroundSecondary: '#252526',
  backgroundTertiary: '#2d2d30',
  foreground: '#d4d4d4',
  foregroundSecondary: '#e0e0e0',
  foregroundMuted: '#808080',
  border: '#3e3e42',
  borderHover: '#4e4e52',
  accent: '#0078d4',
  accentHover: '#1e90ff',
  success: '#4ec9b0',
  warning: '#ce9178',
  error: '#f48771',
  errorBackground: '#3c2a2a',
};

export const LightTheme: ThemeColors = {
  background: '#ffffff',
  backgroundSecondary: '#f3f3f3',
  backgroundTertiary: '#e8e8e8',
  foreground: '#333333',
  foregroundSecondary: '#444444',
  foregroundMuted: '#888888',
  border: '#d4d4d4',
  borderHover: '#c4c4c4',
  accent: '#0078d4',
  accentHover: '#1e90ff',
  success: '#2e8b57',
  warning: '#d2691e',
  error: '#dc2626',
  errorBackground: '#fee2e2',
};

export interface FirmwareProject {
  id: string;
  name: string;
  path: string;
  type: 'stm32' | 'esp32' | 'nrf52' | 'custom';
  compiler: CompilerConfig;
  version: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  lastBuild?: BuildRecord;
  tags: string[];
}

export interface CompilerConfig {
  type: 'gcc-arm' | 'xtensa' | 'keil' | 'iar' | 'custom';
  path: string;
  args: string[];
  env?: Record<string, string>;
  buildCommand: string;
  cleanCommand?: string;
  outputPattern: string;
}

export interface FileSnapshot {
  path: string;
  size: number;
  md5: string;
  modifiedTime: number;
  lineCount: number;
  content?: string;
}

export interface BuildSnapshot {
  buildId: string;
  projectPath: string;
  files: FileSnapshot[];
  sectionSizes?: {
    text: number;
    data: number;
    bss: number;
  };
  createdAt: number;
}

export interface BuildRecord {
  id: string;
  projectId: string;
  version: string;
  status: 'pending' | 'building' | 'success' | 'failed' | 'skipped';
  startTime: number;
  endTime?: number;
  outputPath?: string;
  outputFiles: string[];
  md5?: string;
  size?: number;
  error?: string;
  logId?: string;
  snapshot?: BuildSnapshot;
}

export interface BuildTask {
  id: string;
  projectIds: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  startTime?: number;
  endTime?: number;
  buildRecords: Record<string, BuildRecord>;
  options: BuildOptions;
}

export interface BuildOptions {
  cleanBuild: boolean;
  parallel: boolean;
  parallelCount: number;
  uploadAfterBuild: boolean;
  generateVersionInfo: boolean;
  customEnv?: Record<string, string>;
}

export interface VersionInfo {
  version: string;
  buildNumber: number;
  commitHash?: string;
  buildTime: number;
  compilerVersion: string;
  md5: string;
  size: number;
  projectName: string;
  projectId: string;
  additionalInfo?: Record<string, string>;
}

export interface DiffResult {
  leftVersion: string;
  rightVersion: string;
  sizeDiff: number;
  sections: SectionDiff[];
  hashes: {
    left: string;
    right: string;
  };
  changes: FileChange[];
}

export interface SectionDiff {
  name: string;
  leftSize: number;
  rightSize: number;
  diff: number;
}

export interface FileChange {
  file: string;
  type: 'added' | 'modified' | 'deleted';
  linesAdded: number;
  linesDeleted: number;
}

export interface FirmwareArchive {
  id: string;
  projectId: string;
  projectName: string;
  version: string;
  buildNumber: number;
  fileSize: number;
  md5: string;
  uploadTime: number;
  uploader: string;
  filePath: string;
  tags: string[];
  description: string;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug';
  source: string;
  message: string;
  projectId?: string;
  buildId?: string;
  metadata?: Record<string, unknown>;
}

export interface ServerConfig {
  host: string;
  port: number;
  apiKey?: string;
  useSsl: boolean;
}

export interface AppConfig {
  projectsPath: string;
  outputPath: string;
  logPath: string;
  tempPath: string;
  server: ServerConfig;
  compilers: CompilerConfig[];
  theme: 'light' | 'dark' | 'auto';
}

export interface PaginationParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RiskCheckResult {
  projectId: string;
  projectName: string;
  overallRisk: 'low' | 'medium' | 'high' | 'critical';
  checks: RiskCheck[];
  canBuild: boolean;
  warnings: string[];
}

export interface RiskCheck {
  name: string;
  category: 'environment' | 'source' | 'config' | 'dependency' | 'resource';
  status: 'pass' | 'warning' | 'fail';
  message: string;
  detail?: string;
  suggestion?: string;
}

export interface VersionRollbackRequest {
  projectId: string;
  targetVersion: string;
  reason?: string;
}

export interface VersionRollbackResult {
  success: boolean;
  previousVersion: string;
  newVersion: string;
  rollbackId: string;
  message: string;
}

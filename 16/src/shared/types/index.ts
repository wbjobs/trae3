export interface Terminal {
  id: string;
  name: string;
  ip: string;
  mac: string;
  model: string;
  firmwareVersion: string;
  status: TerminalStatus;
  groupId?: string;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

export enum TerminalStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  UPGRADING = 'upgrading',
  ERROR = 'error'
}

export interface TerminalGroup {
  id: string;
  name: string;
  description?: string;
  terminalCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Firmware {
  id: string;
  name: string;
  version: string;
  model: string;
  size: number;
  md5: string;
  sha256: string;
  filePath: string;
  uploadTime: Date;
  uploadedBy: string;
  description?: string;
  encrypted?: boolean;
  signature?: string;
}

export interface FirmwareValidationResult {
  valid: boolean;
  error?: string;
  errors?: string[];
  md5Match?: boolean;
  sha256Match?: boolean;
  modelCompatible?: boolean;
}

export interface UpgradeTask {
  id: string;
  name: string;
  firmwareId: string;
  terminalIds: string[];
  status: TaskStatus;
  progress: number;
  completedCount: number;
  totalCount: number;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
  errorMessage?: string;
}

export interface TaskProgress {
  taskId: string;
  terminalId: string;
  status: TerminalUpgradeStatus;
  progress: number;
  message?: string;
  updatedAt: Date;
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export enum TerminalUpgradeStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  VERIFYING = 'verifying',
  INSTALLING = 'installing',
  REBOOTING = 'rebooting',
  SUCCESS = 'success',
  FAILED = 'failed'
}

export interface LogEntry {
  id: string;
  level: LogLevel;
  module: string;
  action: string;
  message: string;
  details?: Record<string, unknown>;
  createdAt: Date;
}

export enum LogLevel {
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  DEBUG = 'debug'
}

export interface NetworkScanResult {
  ip: string;
  mac?: string;
  hostname?: string;
  isAlive: boolean;
  responseTime?: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface TerminalCreateOptions {
  name: string;
  ip: string;
  mac: string;
  model: string;
  firmwareVersion: string;
  groupId?: string;
  status?: TerminalStatus;
}

export interface TerminalUpdateOptions {
  name?: string;
  ip?: string;
  mac?: string;
  model?: string;
  firmwareVersion?: string;
  groupId?: string;
  status?: TerminalStatus;
  lastSeen?: Date;
}

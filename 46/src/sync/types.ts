export interface SyncConfig {
  serverUrl: string;
  apiKey: string;
  deviceId: string;
  syncInterval: number;
  conflictStrategy: 'local-wins' | 'remote-wins' | 'manual';
  autoSync: boolean;
}

export interface RemoteFileInfo {
  id: string;
  name: string;
  path: string;
  size: number;
  hash: string;
  version: number;
  lastModified: string;
  createdBy: string;
  updatedBy: string;
}

export interface VersionRecord {
  id: string;
  fileId: string;
  version: number;
  hash: string;
  contentHash: string;
  timestamp: string;
  author: string;
  deviceId: string;
  changeDescription: string;
  deltaFrom?: string;
}

export interface SyncStatus {
  lastSyncTime: string | null;
  syncInProgress: boolean;
  pendingUploads: number;
  pendingDownloads: number;
  conflicts: ConflictRecord[];
  errors: SyncError[];
}

export interface ConflictRecord {
  id: string;
  fileId: string;
  fileName: string;
  localVersion: VersionRecord;
  remoteVersion: VersionRecord;
  resolved: boolean;
  resolution?: 'local' | 'remote' | 'merge';
}

export interface SyncError {
  timestamp: string;
  operation: string;
  fileId?: string;
  message: string;
  retryable: boolean;
}

export interface SyncOperation {
  type: 'upload' | 'download' | 'delete' | 'conflict';
  fileId: string;
  fileName: string;
  localVersion?: number;
  remoteVersion?: number;
  progress?: number;
}

export interface FileUploadRequest {
  name: string;
  path: string;
  content: string;
  hash: string;
  deviceId: string;
  changeDescription: string;
  baseVersion?: number;
}

export interface FileUploadResponse {
  id: string;
  version: number;
  hash: string;
  timestamp: string;
}

export interface FileDownloadResponse {
  id: string;
  name: string;
  content: string;
  version: number;
  hash: string;
  lastModified: string;
}

export interface VersionListResponse {
  fileId: string;
  versions: VersionRecord[];
  total: number;
}

export interface DeltaResponse {
  fromVersion: number;
  toVersion: number;
  delta: string;
  timestamp: string;
}

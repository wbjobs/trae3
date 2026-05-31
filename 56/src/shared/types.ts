export type DrawingFormat = 'dwg' | 'dxf' | 'pdf' | 'svg' | 'png' | 'jpg';

export interface DrawingFile {
  id: string;
  name: string;
  format: DrawingFormat;
  size: number;
  path: string;
  hash: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConvertTask {
  id: string;
  sourceFile: DrawingFile;
  targetFormat: DrawingFormat;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  outputPath?: string;
  error?: string;
  createdAt: string;
}

export interface VersionSnapshot {
  id: string;
  drawingId: string;
  version: number;
  hash: string;
  path: string;
  size: number;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DiffResult {
  added: DiffItem[];
  removed: DiffItem[];
  modified: DiffItem[];
  summary: string;
  similarity: number;
}

export interface DiffItem {
  type: string;
  layer?: string;
  bounds?: { x: number; y: number; width: number; height: number };
  description: string;
}

export interface SyncStatus {
  lastSyncTime: string | null;
  isSyncing: boolean;
  pendingUploads: number;
  pendingDownloads: number;
  totalCloudFiles: number;
  totalLocalFiles: number;
}

export interface CloudDrawing {
  id: string;
  name: string;
  format: DrawingFormat;
  size: number;
  version: number;
  cloudUrl: string;
  uploadedAt: string;
  updatedAt: string;
}

export interface SyncTask {
  id: string;
  type: 'upload' | 'download';
  drawing: CloudDrawing;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  createdAt: string;
}

export interface CacheEntry {
  key: string;
  data: ArrayBuffer | string;
  size: number;
  accessedAt: string;
  createdAt: string;
  expiresAt?: string;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  maxCapacity: number;
  hitRate: number;
}

export interface EncryptTask {
  id: string;
  sourcePath: string;
  outputPath?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  encryptedHash?: string;
  error?: string;
  createdAt: string;
}

export interface DecryptTask {
  id: string;
  sourcePath: string;
  outputPath?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
  createdAt: string;
}

export interface EncryptionKey {
  id: string;
  name: string;
  createdAt: string;
  lastUsed?: string;
  isActive: boolean;
}

export interface HighlightDiff {
  type: 'added' | 'removed' | 'modified';
  bounds: { x: number; y: number; width: number; height: number };
  description: string;
  color: string;
  entityId?: string;
}

export interface HighlightResult {
  originalSvg: string;
  highlightedSvg: string;
  diffs: HighlightDiff[];
  summary: {
    added: number;
    removed: number;
    modified: number;
  };
}

export type IpcChannel =
  | 'convert:start'
  | 'convert:cancel'
  | 'convert:progress'
  | 'convert:batch'
  | 'convert:cacheStats'
  | 'convert:clearCache'
  | 'compare:start'
  | 'compare:result'
  | 'compare:highlight'
  | 'sync:status'
  | 'sync:upload'
  | 'sync:download'
  | 'sync:progress'
  | 'cache:stats'
  | 'cache:clear'
  | 'cache:get'
  | 'cache:set'
  | 'drawing:list'
  | 'drawing:open'
  | 'app:version'
  | 'encrypt:start'
  | 'encrypt:batch'
  | 'encrypt:decrypt'
  | 'encrypt:progress'
  | 'encrypt:listKeys'
  | 'encrypt:createKey'
  | 'encrypt:deleteKey'
  | 'platform:getInfo';

export interface IpcResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

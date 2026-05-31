// 文件数据模型

/**
 * 文件类型枚举
 */
export enum FileType {
  IMAGE = 'image',
  PDF = 'pdf',
  DOCUMENT = 'document',
  ARCHIVE = 'archive',
  AUDIO = 'audio',
  VIDEO = 'video',
  OTHER = 'other'
}

/**
 * 文件状态枚举
 */
export enum FileStatus {
  UPLOADING = 'uploading',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PROCESSING = 'processing',
  READY = 'ready'
}

/**
 * 访问权限枚举
 */
export enum FileAccess {
  PRIVATE = 'private',
  PROJECT = 'project',
  PUBLIC = 'public'
}

/**
 * 文件信息接口
 */
export interface FileInfo {
  id: string;
  name: string;
  originalName: string;
  type: FileType;
  mimeType: string;
  size: number;
  status: FileStatus;
  access: FileAccess;
  projectId?: string;
  uploadedBy: string;
  uploadedByName?: string;
  url: string;
  thumbnailUrl?: string;
  previewUrl?: string;
  checksum?: string;
  chunks?: FileChunkInfo[];
  metadata?: Record<string, any>;
  tags: string[];
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

/**
 * 文件块信息接口
 */
export interface FileChunkInfo {
  index: number;
  size: number;
  uploaded: boolean;
  uploadedAt?: Date;
  checksum?: string;
}

/**
 * 分片上传请求接口
 */
export interface ChunkUploadRequest {
  fileId: string;
  chunkIndex: number;
  totalChunks: number;
  chunkSize: number;
  totalSize: number;
  fileName: string;
  fileType: string;
  projectId?: string;
  access?: FileAccess;
  checksum?: string;
}

/**
 * 分片上传响应接口
 */
export interface ChunkUploadResponse {
  fileId: string;
  chunkIndex: number;
  uploaded: boolean;
  progress: number;
  checksum?: string;
}

/**
 * 上传进度接口
 */
export interface UploadProgress {
  fileId: string;
  fileName: string;
  totalSize: number;
  uploadedSize: number;
  progress: number;
  speed: number;
  remainingTime: number;
  status: FileStatus;
  chunks: {
    total: number;
    uploaded: number;
    failed: number;
  };
  error?: string;
}

/**
 * 初始化上传请求接口
 */
export interface InitializeUploadRequest {
  fileName: string;
  fileSize: number;
  fileType: string;
  chunkSize: number;
  projectId?: string;
  access?: FileAccess;
  description?: string;
  tags?: string[];
  metadata?: Record<string, any>;
}

/**
 * 初始化上传响应接口
 */
export interface InitializeUploadResponse {
  fileId: string;
  chunkSize: number;
  totalChunks: number;
  uploadUrl?: string;
  exists: boolean;
  uploadedChunks?: number[];
}

/**
 * 完成上传请求接口
 */
export interface CompleteUploadRequest {
  fileId: string;
  checksum?: string;
  metadata?: Record<string, any>;
}

/**
 * 完成上传响应接口
 */
export interface CompleteUploadResponse {
  fileId: string;
  fileInfo: FileInfo;
  processing: boolean;
  processingJobId?: string;
}

/**
 * 合并分片请求接口
 */
export interface MergeChunksRequest {
  fileId: string;
  checksum?: string;
}

/**
 * 文件筛选条件接口
 */
export interface FileFilter {
  projectId?: string;
  type?: FileType | FileType[];
  status?: FileStatus | FileStatus[];
  access?: FileAccess | FileAccess[];
  uploadedBy?: string;
  searchText?: string;
  tags?: string[];
  minSize?: number;
  maxSize?: number;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'size' | 'name';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 文件分页响应接口
 */
export interface FilePageResponse {
  items: FileInfo[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  totalSize: number;
}

/**
 * 文件批量操作请求接口
 */
export interface FileBatchRequest {
  fileIds: string[];
  action: 'delete' | 'move' | 'copy' | 'download' | 'share' | 'unshare';
  targetProjectId?: string;
  access?: FileAccess;
}

/**
 * 文件分享请求接口
 */
export interface FileShareRequest {
  fileId: string;
  access: FileAccess;
  expiresAt?: Date;
  password?: string;
}

/**
 * 文件预览配置接口
 */
export interface FilePreviewConfig {
  maxSize: number;
  supportedTypes: FileType[];
  watermark?: {
    enabled: boolean;
    text: string;
    opacity: number;
  };
}

/**
 * 文件处理任务接口
 */
export interface FileProcessingJob {
  id: string;
  fileId: string;
  type: 'thumbnail' | 'ocr' | 'convert' | 'compress' | 'extract';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * 拖拽上传配置接口
 */
export interface DropzoneConfig {
  multiple: boolean;
  maxFiles: number;
  maxFileSize: number;
  acceptedTypes: string[];
  autoUpload: boolean;
  chunkSize: number;
  parallelChunks: number;
  retryAttempts: number;
}

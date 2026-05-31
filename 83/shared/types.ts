export type UserRole = 'admin' | 'operator' | 'auditor' | 'viewer';

export type RubbingStatus = 'draft' | 'pending' | 'published';

export type WorkflowStatus = RubbingStatus;

export type WorkflowAction = 'submit' | 'approve' | 'update' | 'create' | 'reject';

export type UploadStatus = 'uploading' | 'completed' | 'failed';

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RubbingDimensions {
  width: number;
  height: number;
  unit: string;
}

export interface RubbingMetadata {
  id: string;
  accessionNo: string;
  title: string;
  dynasty?: string;
  era?: string;
  author?: string;
  calligrapher?: string;
  material?: string;
  dimensions?: RubbingDimensions | string;
  rubbingDate?: string;
  rubbingMethod?: string;
  collector?: string;
  collectionNo?: string;
  description?: string;
  inscription?: string;
  location?: string;
  inscriptionContent?: string;
  transcription?: string;
  bibliography?: string;
  provenance?: string;
  notes?: string;
  fileId?: string;
  fileInfo?: FileInfo;
  keywords: string[];
  status: RubbingStatus;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileInfo {
  id: string;
  rubbingId?: string;
  originalName: string;
  fileName: string;
  filename?: string;
  fileSize: number;
  size?: number;
  mimeType: string;
  width?: number;
  height?: number;
  dpi?: number;
  colorSpace?: string;
  checksum: string;
  md5Hash?: string;
  storagePath: string;
  storageBucket: string;
  isPrimary: boolean;
  createdAt: string;
}

export interface UploadSession {
  id: string;
  fileId?: string;
  fileName: string;
  totalSize: number;
  totalChunks: number;
  uploadedChunks: number;
  checksum?: string;
  status: UploadStatus;
  createdAt: string;
  expiresAt: string;
}

export interface Version {
  id: string;
  rubbingId: string;
  versionNo: number;
  metadataSnapshot: RubbingMetadata;
  createdBy?: string;
  createdAt: string;
  changeNote?: string;
}

export interface WorkflowRecord {
  id: string;
  rubbingId: string;
  action: WorkflowAction;
  operatorId?: string;
  operatorName?: string;
  comment?: string;
  previousStatus?: RubbingStatus;
  newStatus: RubbingStatus;
  toStatus: RubbingStatus;
  createdAt: string;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

export interface FileValidationResult extends ValidationResult {
  fileInfo?: Partial<FileInfo>;
}

export interface SearchQuery {
  keyword?: string;
  dynasty?: string;
  era?: string;
  author?: string;
  dateRange?: [string, string];
  status?: RubbingStatus[];
  page: number;
  pageSize: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
}

export interface SearchResult<T> {
  total: number;
  items: T[];
  page: number;
  pageSize: number;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: ValidationError[];
}

export interface UploadProgress {
  sessionId: string;
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  status: UploadStatus;
}

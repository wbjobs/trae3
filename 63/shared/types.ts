export type FileType = 'DWG' | 'SHP' | 'GDB' | 'TIF' | 'OTHER';

export type ArchiveStatus = 
  | 'UPLOADING' 
  | 'VALIDATING' 
  | 'PENDING' 
  | 'QUALITY_CHECKING' 
  | 'APPROVED' 
  | 'REJECTED';

export type UploadTaskStatus = 
  | 'PENDING' 
  | 'UPLOADING' 
  | 'VALIDATING' 
  | 'SUCCESS' 
  | 'FAILED';

export type QualityResult = 'PASS' | 'FAIL';

export type IssueType = 'FORMAT' | 'CONTENT' | 'METADATA' | 'OTHER';

export type IssueSeverity = 'CRITICAL' | 'MAJOR' | 'MINOR';

export interface ArchiveMetadata {
  id: string;
  projectName: string;
  coordinateSystem: string;
  scale: string;
  surveyArea: string;
  fileType: FileType;
  fileSize: number;
  fileName: string;
  filePath: string;
  uploader: string;
  uploadTime: string;
  status: ArchiveStatus;
  qualityScore?: number;
  version: number;
}

export interface QualityIssue {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  description: string;
  location?: string;
}

export interface QualityRecord {
  id: string;
  archiveId: string;
  inspector: string;
  checkTime: string;
  result: QualityResult;
  comments: string;
  issues: QualityIssue[];
}

export interface UploadTask {
  id: string;
  fileName: string;
  fileSize: number;
  progress: number;
  status: UploadTaskStatus;
  errorMessage?: string;
}

export interface User {
  id: string;
  name: string;
  role: 'uploader' | 'inspector' | 'admin';
  avatar?: string;
}

export interface ApiResponse<T = void> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

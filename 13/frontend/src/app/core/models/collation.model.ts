// 勘校模块数据模型

/**
 * 页面状态枚举
 */
export enum PageStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  REVIEWED = 'reviewed'
}

/**
 * 古籍页面接口
 */
export interface AncientPage {
  id: string;
  projectId: string;
  pageNumber: number;
  volumeNumber: number;
  imageUrl: string;
  thumbnailUrl: string;
  ocrText: string;
  collationText: string;
  status: PageStatus;
  createdAt: Date;
  updatedAt: Date;
  collatorId?: string;
  collatorName?: string;
  metadata?: {
    title?: string;
    author?: string;
    dynasty?: string;
    dimensions?: {
      width: number;
      height: number;
    };
  };
}

/**
 * 勘校记录接口
 */
export interface CollationRecord {
  id: string;
  pageId: string;
  projectId: string;
  version: number;
  originalText: string;
  correctedText: string;
  comment?: string;
  collatorId: string;
  collatorName: string;
  createdAt: Date;
  diffs?: TextDiff[];
}

/**
 * 文本差异接口
 */
export interface TextDiff {
  type: 'added' | 'removed' | 'unchanged';
  value: string;
  count?: number;
}

/**
 * 分页查询参数
 */
export interface PageQueryParams {
  page?: number;
  pageSize?: number;
  status?: PageStatus;
  projectId?: string;
  keyword?: string;
}

/**
 * 分页响应
 */
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 提交勘校请求
 */
export interface SubmitCollationRequest {
  pageId: string;
  collationText: string;
  comment?: string;
  markAsCompleted?: boolean;
}

/**
 * 版本对比请求
 */
export interface CompareVersionsRequest {
  pageId: string;
  version1: number;
  version2: number;
}

/**
 * 快捷键配置
 */
export interface ShortcutConfig {
  key: string;
  description: string;
  action: () => void;
}

/**
 * 勘校工作台状态
 */
export interface WorkbenchState {
  currentPage: AncientPage | null;
  pages: AncientPage[];
  currentIndex: number;
  isLoading: boolean;
  isSaving: boolean;
  history: CollationRecord[];
  showHistory: boolean;
  rotation: number;
  zoom: number;
}

/**
 * 任务优先级枚举
 */
export enum TaskPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  URGENT = 3
}

/**
 * 任务状态枚举
 */
export enum TaskStatus {
  PENDING = 0,
  IN_PROGRESS = 1,
  CANCELLED = 2,
  COMPLETED = 3
}

/**
 * 批量分派请求
 */
export interface TaskBatchAssignRequest {
  projectId: string;
  pageIds: string[];
  collatorId: string;
  collatorName: string;
  priority?: TaskPriority;
  deadline?: Date;
  remark?: string;
}

/**
 * 重新分派请求
 */
export interface TaskReassignRequest {
  collatorId: string;
  collatorName: string;
  pageIds?: string[];
  priority?: TaskPriority;
  deadline?: Date;
  remark?: string;
}

/**
 * 取消分派请求
 */
export interface TaskCancelRequest {
  reason?: string;
}

/**
 * 任务分派VO
 */
export interface TaskDispatchVO {
  id: string;
  projectId: string;
  projectName: string;
  pageCount: number;
  dispatcherId: string;
  dispatcherName: string;
  collatorId: string;
  collatorName: string;
  priority: TaskPriority;
  priorityName: string;
  deadline?: Date;
  remark?: string;
  status: TaskStatus;
  statusName: string;
  completedPages: number;
  progress: number;
  createTime: Date;
  updateTime: Date;
}

/**
 * 任务分派详情VO
 */
export interface TaskDispatchDetailVO {
  id: string;
  projectId: string;
  projectName: string;
  pages: AncientPage[];
  dispatcherId: string;
  dispatcherName: string;
  collatorId: string;
  collatorName: string;
  priority: TaskPriority;
  priorityName: string;
  deadline?: Date;
  remark?: string;
  status: TaskStatus;
  statusName: string;
  completedPages: number;
  progress: number;
  createTime: Date;
  updateTime: Date;
}

/**
 * 分派统计
 */
export interface DispatchStatistics {
  projectId: string;
  projectName: string;
  totalPages: number;
  assignedPages: number;
  pendingPages: number;
  inProgressPages: number;
  reviewingPages: number;
  completedPages: number;
  activeDispatches: number;
}

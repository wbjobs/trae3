// 项目数据模型

import { User } from './user.model';

/**
 * 项目状态枚举
 */
export enum ProjectStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ARCHIVED = 'archived'
}

/**
 * 项目角色枚举
 */
export enum ProjectRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  COLLATOR = 'collator',
  REVIEWER = 'reviewer',
  ANNOTATOR = 'annotator',
  VIEWER = 'viewer'
}

/**
 * 项目类型枚举
 */
export enum ProjectType {
  COLLATION = 'collation',
  ANNOTATION = 'annotation',
  TRANSCRIPTION = 'transcription',
  RESEARCH = 'research'
}

/**
 * 项目成员接口
 */
export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  user?: User;
  role: ProjectRole;
  joinedAt: Date;
  invitedBy?: string;
  invitedByUser?: User;
  permissions: string[];
}

/**
 * 项目统计信息接口
 */
export interface ProjectStats {
  totalPages: number;
  completedPages: number;
  inProgressPages: number;
  pendingPages: number;
  totalAnnotations: number;
  openAnnotations: number;
  resolvedAnnotations: number;
  totalCollations: number;
  totalMembers: number;
  lastActivityAt: Date;
}

/**
 * 项目配置接口
 */
export interface ProjectConfig {
  allowOcrEdit: boolean;
  requireReview: boolean;
  autoSaveInterval: number;
  enableRealtime: boolean;
  enableNotifications: boolean;
  defaultPageSize: number;
  allowedFileTypes: string[];
  maxFileSize: number;
}

/**
 * 项目接口
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  type: ProjectType;
  status: ProjectStatus;
  coverImage?: string;
  ownerId: string;
  owner?: User;
  members: ProjectMember[];
  stats: ProjectStats;
  config: ProjectConfig;
  metadata?: {
    title?: string;
    author?: string;
    dynasty?: string;
    period?: string;
    source?: string;
    keywords?: string[];
  };
  isPublic: boolean;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * 创建项目请求接口
 */
export interface CreateProjectRequest {
  name: string;
  description?: string;
  type: ProjectType;
  coverImage?: string;
  metadata?: Project['metadata'];
  tags?: string[];
  isPublic?: boolean;
  config?: Partial<ProjectConfig>;
}

/**
 * 更新项目请求接口
 */
export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  status?: ProjectStatus;
  coverImage?: string;
  metadata?: Project['metadata'];
  tags?: string[];
  isPublic?: boolean;
  config?: Partial<ProjectConfig>;
}

/**
 * 项目筛选条件接口
 */
export interface ProjectFilter {
  status?: ProjectStatus | ProjectStatus[];
  type?: ProjectType | ProjectType[];
  userId?: string;
  role?: ProjectRole;
  searchText?: string;
  tags?: string[];
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'status';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 项目分页响应接口
 */
export interface ProjectPageResponse {
  items: Project[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 邀请成员请求接口
 */
export interface InviteMemberRequest {
  projectId: string;
  userId?: string;
  email?: string;
  username?: string;
  role: ProjectRole;
  message?: string;
}

/**
 * 更新成员角色请求接口
 */
export interface UpdateMemberRoleRequest {
  projectId: string;
  memberId: string;
  role: ProjectRole;
}

/**
 * 项目活动类型枚举
 */
export enum ProjectActivityType {
  PROJECT_CREATED = 'project_created',
  PROJECT_UPDATED = 'project_updated',
  MEMBER_JOINED = 'member_joined',
  MEMBER_LEFT = 'member_left',
  PAGE_UPLOADED = 'page_uploaded',
  COLLATION_SUBMITTED = 'collation_submitted',
  ANNOTATION_CREATED = 'annotation_created',
  STATUS_CHANGED = 'status_changed'
}

/**
 * 项目活动接口
 */
export interface ProjectActivity {
  id: string;
  projectId: string;
  type: ProjectActivityType;
  userId: string;
  user?: User;
  data: any;
  createdAt: Date;
}

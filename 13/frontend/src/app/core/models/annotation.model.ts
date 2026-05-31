// 批注数据模型

import { User } from './user.model';

/**
 * 批注状态枚举
 */
export enum AnnotationStatus {
  OPEN = 'OPEN',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED'
}

/**
 * 批注优先级枚举
 */
export enum AnnotationPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT'
}

/**
 * 文本选择接口
 * 描述批注关联的文本选区信息
 */
export interface TextSelection {
  startOffset: number;
  endOffset: number;
  selectedText: string;
  contextBefore?: string;
  contextAfter?: string;
  paragraphIndex?: number;
  pageNumber?: number;
}

/**
 * 提及用户接口
 * 描述批注中@提及的用户信息
 */
export interface MentionUser {
  id: string;
  username: string;
  nickname: string;
  avatar?: string;
  offset: number;
  length: number;
}

/**
 * 批注回复接口
 */
export interface AnnotationReply {
  id: string;
  annotationId: string;
  authorId: string;
  author?: User;
  content: string;
  mentions: MentionUser[];
  isEdited: boolean;
  editedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建批注回复请求接口
 */
export interface CreateAnnotationReplyRequest {
  annotationId: string;
  content: string;
  mentions: MentionUser[];
}

/**
 * 更新批注回复请求接口
 */
export interface UpdateAnnotationReplyRequest {
  content: string;
  mentions: MentionUser[];
}

/**
 * 批注接口
 */
export interface Annotation {
  id: string;
  projectId: string;
  documentId: string;
  authorId: string;
  author?: User;
  title?: string;
  content: string;
  selection: TextSelection;
  status: AnnotationStatus;
  priority: AnnotationPriority;
  tags: string[];
  mentions: MentionUser[];
  replies: AnnotationReply[];
  replyCount: number;
  assigneeId?: string;
  assignee?: User;
  resolvedBy?: string;
  resolvedAt?: Date;
  isEdited: boolean;
  editedAt?: Date;
  readBy: string[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * 创建批注请求接口
 */
export interface CreateAnnotationRequest {
  projectId: string;
  documentId: string;
  title?: string;
  content: string;
  selection: TextSelection;
  priority?: AnnotationPriority;
  tags?: string[];
  mentions: MentionUser[];
  assigneeId?: string;
}

/**
 * 更新批注请求接口
 */
export interface UpdateAnnotationRequest {
  title?: string;
  content?: string;
  status?: AnnotationStatus;
  priority?: AnnotationPriority;
  tags?: string[];
  mentions?: MentionUser[];
  assigneeId?: string;
}

/**
 * 批注筛选条件接口
 */
export interface AnnotationFilter {
  projectId?: string;
  documentId?: string;
  authorId?: string;
  assigneeId?: string;
  status?: AnnotationStatus | AnnotationStatus[];
  priority?: AnnotationPriority | AnnotationPriority[];
  tags?: string[];
  mentionedUserId?: string;
  searchText?: string;
  startDate?: Date;
  endDate?: Date;
  page?: number;
  pageSize?: number;
  sortBy?: 'createdAt' | 'updatedAt' | 'priority' | 'replyCount';
  sortOrder?: 'asc' | 'desc';
}

/**
 * 批注分页响应接口
 */
export interface AnnotationPageResponse {
  items: Annotation[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * 批注通知类型枚举
 */
export enum AnnotationNotificationType {
  NEW_ANNOTATION = 'NEW_ANNOTATION',
  NEW_REPLY = 'NEW_REPLY',
  MENTIONED = 'MENTIONED',
  STATUS_CHANGED = 'STATUS_CHANGED',
  ASSIGNED = 'ASSIGNED',
  RESOLVED = 'RESOLVED'
}

/**
 * 批注通知接口
 */
export interface AnnotationNotification {
  id: string;
  type: AnnotationNotificationType;
  userId: string;
  annotationId: string;
  annotation?: Annotation;
  replyId?: string;
  reply?: AnnotationReply;
  triggeredByUserId: string;
  triggeredBy?: User;
  isRead: boolean;
  readAt?: Date;
  createdAt: Date;
}

/**
 * 批注通知标记已读请求接口
 */
export interface MarkNotificationReadRequest {
  notificationIds?: string[];
  all?: boolean;
}

/**
 * 实时批注事件类型枚举
 */
export enum RealtimeAnnotationEventType {
  ANNOTATION_CREATED = 'ANNOTATION_CREATED',
  ANNOTATION_UPDATED = 'ANNOTATION_UPDATED',
  ANNOTATION_DELETED = 'ANNOTATION_DELETED',
  REPLY_CREATED = 'REPLY_CREATED',
  REPLY_UPDATED = 'REPLY_UPDATED',
  REPLY_DELETED = 'REPLY_DELETED',
  NOTIFICATION = 'NOTIFICATION',
  USER_TYPING = 'USER_TYPING'
}

/**
 * 实时批注事件接口
 */
export interface RealtimeAnnotationEvent<T = any> {
  type: RealtimeAnnotationEventType;
  projectId: string;
  documentId?: string;
  data: T;
  timestamp: number;
  senderId: string;
  eventId: string;
}

/**
 * 用户正在输入事件数据接口
 */
export interface UserTypingEventData {
  annotationId?: string;
  isTyping: boolean;
}

/**
 * 批注统计信息接口
 */
export interface AnnotationStats {
  total: number;
  open: number;
  resolved: number;
  closed: number;
  myAnnotations: number;
  assignedToMe: number;
  mentions: number;
  unreadNotifications: number;
}

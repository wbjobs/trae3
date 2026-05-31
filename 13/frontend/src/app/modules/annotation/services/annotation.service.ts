// 批注服务 - 封装CRUD API

import { Injectable, inject } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { ApiService } from '@core/services/api.service';
import {
  Annotation,
  AnnotationReply,
  CreateAnnotationRequest,
  UpdateAnnotationRequest,
  CreateAnnotationReplyRequest,
  UpdateAnnotationReplyRequest,
  AnnotationFilter,
  AnnotationPageResponse,
  AnnotationNotification,
  MarkNotificationReadRequest,
  AnnotationStats
} from '@core/models/annotation.model';

@Injectable({ providedIn: 'root' })
export class AnnotationService {
  private apiService = inject(ApiService);
  private readonly basePath = '/annotations';

  /**
   * 获取批注列表（分页）
   * @param filter 筛选条件
   */
  getAnnotations(filter: AnnotationFilter): Observable<AnnotationPageResponse> {
    const params = this.buildFilterParams(filter);
    return this.apiService.get<AnnotationPageResponse>(this.basePath, { params });
  }

  /**
   * 获取单个批注详情
   * @param id 批注ID
   */
  getAnnotation(id: string): Observable<Annotation> {
    return this.apiService.get<Annotation>(`${this.basePath}/${id}`);
  }

  /**
   * 创建批注
   * @param request 创建请求
   */
  createAnnotation(request: CreateAnnotationRequest): Observable<Annotation> {
    return this.apiService.post<Annotation>(this.basePath, request);
  }

  /**
   * 更新批注
   * @param id 批注ID
   * @param request 更新请求
   */
  updateAnnotation(id: string, request: UpdateAnnotationRequest): Observable<Annotation> {
    return this.apiService.put<Annotation>(`${this.basePath}/${id}`, request);
  }

  /**
   * 删除批注
   * @param id 批注ID
   */
  deleteAnnotation(id: string): Observable<void> {
    return this.apiService.delete<void>(`${this.basePath}/${id}`);
  }

  /**
   * 更新批注状态
   * @param id 批注ID
   * @param status 新状态
   */
  updateStatus(id: string, status: string): Observable<Annotation> {
    return this.apiService.patch<Annotation>(`${this.basePath}/${id}/status`, { status });
  }

  /**
   * 标记批注为已读
   * @param id 批注ID
   */
  markAsRead(id: string): Observable<void> {
    return this.apiService.post<void>(`${this.basePath}/${id}/read`, {});
  }

  /**
   * 批量标记批注为已读
   * @param ids 批注ID列表
   */
  markMultipleAsRead(ids: string[]): Observable<void> {
    return this.apiService.post<void>(`${this.basePath}/read-batch`, { ids });
  }

  /**
   * 获取批注回复列表
   * @param annotationId 批注ID
   */
  getReplies(annotationId: string): Observable<AnnotationReply[]> {
    return this.apiService.get<AnnotationReply[]>(
      `${this.basePath}/${annotationId}/replies`
    );
  }

  /**
   * 创建批注回复
   * @param request 创建请求
   */
  createReply(request: CreateAnnotationReplyRequest): Observable<AnnotationReply> {
    return this.apiService.post<AnnotationReply>(
      `${this.basePath}/${request.annotationId}/replies`,
      request
    );
  }

  /**
   * 更新批注回复
   * @param annotationId 批注ID
   * @param replyId 回复ID
   * @param request 更新请求
   */
  updateReply(
    annotationId: string,
    replyId: string,
    request: UpdateAnnotationReplyRequest
  ): Observable<AnnotationReply> {
    return this.apiService.put<AnnotationReply>(
      `${this.basePath}/${annotationId}/replies/${replyId}`,
      request
    );
  }

  /**
   * 删除批注回复
   * @param annotationId 批注ID
   * @param replyId 回复ID
   */
  deleteReply(annotationId: string, replyId: string): Observable<void> {
    return this.apiService.delete<void>(
      `${this.basePath}/${annotationId}/replies/${replyId}`
    );
  }

  /**
   * 获取通知列表
   * @param page 页码
   * @param pageSize 每页数量
   * @param unreadOnly 只显示未读
   */
  getNotifications(
    page: number = 1,
    pageSize: number = 20,
    unreadOnly: boolean = false
  ): Observable<{ items: AnnotationNotification[]; total: number }> {
    return this.apiService.get<{ items: AnnotationNotification[]; total: number }>(
      `${this.basePath}/notifications`,
      { params: { page, pageSize, unreadOnly } }
    );
  }

  /**
   * 标记通知为已读
   * @param request 标记请求
   */
  markNotificationsRead(request: MarkNotificationReadRequest): Observable<void> {
    return this.apiService.post<void>(
      `${this.basePath}/notifications/read`,
      request
    );
  }

  /**
   * 获取未读通知数量
   */
  getUnreadNotificationCount(): Observable<number> {
    return this.apiService.get<{ count: number }>(
      `${this.basePath}/notifications/unread-count`
    ).pipe(map((response) => response.count));
  }

  /**
   * 获取批注统计信息
   * @param projectId 项目ID（可选）
   * @param documentId 文档ID（可选）
   */
  getStats(projectId?: string, documentId?: string): Observable<AnnotationStats> {
    const params: any = {};
    if (projectId) params.projectId = projectId;
    if (documentId) params.documentId = documentId;
    return this.apiService.get<AnnotationStats>(`${this.basePath}/stats`, { params });
  }

  /**
   * 搜索可提及的用户
   * @param keyword 搜索关键词
   * @param projectId 项目ID（可选，用于限定搜索范围）
   */
  searchMentionUsers(keyword: string, projectId?: string): Observable<any[]> {
    const params: any = { keyword };
    if (projectId) params.projectId = projectId;
    return this.apiService.get<any[]>(`${this.basePath}/mention-users`, { params });
  }

  /**
   * 从选中文本获取上下文信息
   * @param documentId 文档ID
   * @param selection 文本选择信息
   */
  getSelectionContext(
    documentId: string,
    selection: { startOffset: number; endOffset: number }
  ): Observable<{ contextBefore: string; contextAfter: string }> {
    return this.apiService.post<{ contextBefore: string; contextAfter: string }>(
      `${this.basePath}/selection-context`,
      { documentId, ...selection }
    );
  }

  /**
   * 导出批注
   * @param filter 筛选条件
   * @param format 导出格式（markdown, json, csv）
   */
  exportAnnotations(filter: AnnotationFilter, format: 'markdown' | 'json' | 'csv' = 'markdown'): Observable<Blob> {
    const params = { ...this.buildFilterParams(filter), format };
    return this.apiService.downloadFile(`${this.basePath}/export`, `annotations.${format}`);
  }

  /**
   * 构建筛选参数
   */
  private buildFilterParams(filter: AnnotationFilter): any {
    const params: any = {};

    if (filter.projectId) params.projectId = filter.projectId;
    if (filter.documentId) params.documentId = filter.documentId;
    if (filter.authorId) params.authorId = filter.authorId;
    if (filter.assigneeId) params.assigneeId = filter.assigneeId;
    if (filter.status) {
      params.status = Array.isArray(filter.status)
        ? filter.status.join(',')
        : filter.status;
    }
    if (filter.priority) {
      params.priority = Array.isArray(filter.priority)
        ? filter.priority.join(',')
        : filter.priority;
    }
    if (filter.tags?.length) params.tags = filter.tags.join(',');
    if (filter.mentionedUserId) params.mentionedUserId = filter.mentionedUserId;
    if (filter.searchText) params.searchText = filter.searchText;
    if (filter.startDate) params.startDate = filter.startDate.toISOString();
    if (filter.endDate) params.endDate = filter.endDate.toISOString();
    if (filter.page) params.page = filter.page;
    if (filter.pageSize) params.pageSize = filter.pageSize;
    if (filter.sortBy) params.sortBy = filter.sortBy;
    if (filter.sortOrder) params.sortOrder = filter.sortOrder;

    return params;
  }
}

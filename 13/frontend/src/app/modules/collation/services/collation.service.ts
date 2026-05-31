// 勘校服务 - 封装API调用

import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
  AncientPage,
  CollationRecord,
  PageQueryParams,
  PaginatedResponse,
  SubmitCollationRequest,
  CompareVersionsRequest,
  TextDiff,
  TaskDispatchVO,
  TaskDispatchDetailVO,
  TaskBatchAssignRequest,
  TaskReassignRequest,
  TaskCancelRequest,
  DispatchStatistics
} from '../../../core/models/collation.model';
import * as Diff from 'diff';

@Injectable({ providedIn: 'root' })
export class CollationService {
  private readonly basePath = '/collation';

  constructor(private apiService: ApiService) {}

  /**
   * 获取页面列表（分页）
   * @param params 查询参数
   */
  getPages(params: PageQueryParams): Observable<PaginatedResponse<AncientPage>> {
    return this.apiService.get<PaginatedResponse<AncientPage>>(
      `${this.basePath}/pages`,
      { params: params as any }
    );
  }

  /**
   * 获取页面详情
   * @param pageId 页面ID
   */
  getPageDetail(pageId: string): Observable<AncientPage> {
    return this.apiService.get<AncientPage>(`${this.basePath}/pages/${pageId}`);
  }

  /**
   * 获取项目的所有页面
   * @param projectId 项目ID
   */
  getProjectPages(projectId: string): Observable<AncientPage[]> {
    return this.apiService.get<AncientPage[]>(
      `${this.basePath}/projects/${projectId}/pages`
    );
  }

  /**
   * 提交勘校结果
   * @param request 提交请求
   */
  submitCollation(request: SubmitCollationRequest): Observable<CollationRecord> {
    return this.apiService.post<CollationRecord>(
      `${this.basePath}/collations`,
      request
    );
  }

  /**
   * 获取页面的勘校历史
   * @param pageId 页面ID
   */
  getPageHistory(pageId: string): Observable<CollationRecord[]> {
    return this.apiService.get<CollationRecord[]>(
      `${this.basePath}/pages/${pageId}/history`
    );
  }

  /**
   * 获取单个勘校记录详情
   * @param recordId 记录ID
   */
  getRecordDetail(recordId: string): Observable<CollationRecord> {
    return this.apiService.get<CollationRecord>(
      `${this.basePath}/records/${recordId}`
    );
  }

  /**
   * 版本对比
   * @param request 对比请求
   */
  compareVersions(
    request: CompareVersionsRequest
  ): Observable<{ diffs: TextDiff[]; version1: CollationRecord; version2: CollationRecord }> {
    return this.apiService.get<{
      diffs: TextDiff[];
      version1: CollationRecord;
      version2: CollationRecord;
    }>(`${this.basePath}/compare`, { params: request as any });
  }

  /**
   * 本地文本差异对比（前端计算）
   * @param oldText 旧文本
   * @param newText 新文本
   */
  computeTextDiff(oldText: string, newText: string): TextDiff[] {
    const diffResult = Diff.diffChars(oldText, newText);
    return diffResult.map((part) => ({
      type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
      value: part.value,
      count: part.count
    }));
  }

  /**
   * 按行对比文本
   * @param oldText 旧文本
   * @param newText 新文本
   */
  computeLineDiff(oldText: string, newText: string): TextDiff[] {
    const diffResult = Diff.diffLines(oldText, newText);
    return diffResult.map((part) => ({
      type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
      value: part.value,
      count: part.count
    }));
  }

  /**
   * 按词对比文本
   * @param oldText 旧文本
   * @param newText 新文本
   */
  computeWordDiff(oldText: string, newText: string): TextDiff[] {
    const diffResult = Diff.diffWords(oldText, newText);
    return diffResult.map((part) => ({
      type: part.added ? 'added' : part.removed ? 'removed' : 'unchanged',
      value: part.value,
      count: part.count
    }));
  }

  /**
   * 标记页面状态
   * @param pageId 页面ID
   * @param status 目标状态
   */
  updatePageStatus(
    pageId: string,
    status: string
  ): Observable<AncientPage> {
    return this.apiService.patch<AncientPage>(
      `${this.basePath}/pages/${pageId}/status`,
      { status }
    );
  }

  /**
   * 获取统计信息
   * @param projectId 项目ID（可选）
   */
  getStatistics(projectId?: string): Observable<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    reviewed: number;
  }> {
    const url = projectId
      ? `${this.basePath}/statistics?projectId=${projectId}`
      : `${this.basePath}/statistics`;
    return this.apiService.get(url);
  }

  /**
   * 批量分派任务
   * @param request 批量分派请求
   */
  batchAssignTasks(request: TaskBatchAssignRequest): Observable<TaskDispatchVO> {
    return this.apiService.post<TaskDispatchVO>(`/tasks/assign`, request);
  }

  /**
   * 重新分派任务
   * @param taskId 任务ID
   * @param request 重新分派请求
   */
  reassignTask(taskId: string, request: TaskReassignRequest): Observable<TaskDispatchVO> {
    return this.apiService.put<TaskDispatchVO>(`/tasks/${taskId}/reassign`, request);
  }

  /**
   * 取消分派任务
   * @param taskId 任务ID
   * @param request 取消分派请求
   */
  cancelTask(taskId: string, request?: TaskCancelRequest): Observable<void> {
    return this.apiService.put<void>(`/tasks/${taskId}/cancel`, request);
  }

  /**
   * 获取项目的任务分派列表
   * @param projectId 项目ID
   */
  getProjectDispatches(projectId: string): Observable<TaskDispatchVO[]> {
    return this.apiService.get<TaskDispatchVO[]>(`/tasks/projects/${projectId}`);
  }

  /**
   * 获取任务分派详情
   * @param taskId 任务ID
   */
  getDispatchDetail(taskId: string): Observable<TaskDispatchDetailVO> {
    return this.apiService.get<TaskDispatchDetailVO>(`/tasks/${taskId}`);
  }

  /**
   * 获取当前用户的任务列表
   */
  getMyTasks(): Observable<TaskDispatchVO[]> {
    return this.apiService.get<TaskDispatchVO[]>(`/tasks/my`);
  }

  /**
   * 智能自动分派任务
   * @param projectId 项目ID
   */
  autoAssignTasks(projectId: string): Observable<TaskDispatchVO[]> {
    return this.apiService.post<TaskDispatchVO[]>(`/tasks/auto-assign?projectId=${projectId}`, null);
  }

  /**
   * 获取分派统计信息
   * @param projectId 项目ID
   */
  getDispatchStatistics(projectId: string): Observable<DispatchStatistics> {
    return this.apiService.get<DispatchStatistics>(`/tasks/statistics/${projectId}`);
  }
}

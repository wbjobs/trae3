// 任务列表组件

import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject,
  input,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  TaskDispatchVO,
  TaskStatus,
  TaskPriority,
  TaskReassignRequest,
  TaskCancelRequest
} from '../../../../core/models/collation.model';
import { CollationService } from '../../services/collation.service';

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-list.component.html',
  styleUrls: ['./task-list.component.scss']
})
export class TaskListComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly collationService = inject(CollationService);
  private readonly destroy$ = new Subject<void>();

  readonly projectId = input<string>();
  readonly mode = input<'all' | 'my'>('all');
  readonly viewDetail = output<TaskDispatchVO>();
  readonly reassign = output<TaskDispatchVO>();

  readonly tasks = signal<TaskDispatchVO[]>([]);
  readonly isLoading = signal(false);
  readonly selectedStatus = signal<TaskStatus | 'all'>('all');
  readonly searchKeyword = signal('');

  readonly statusOptions: Array<{ value: TaskStatus | 'all'; label: string; color: string }> = [
    { value: 'all', label: '全部', color: '#666' },
    { value: TaskStatus.IN_PROGRESS, label: '进行中', color: '#2196f3' },
    { value: TaskStatus.COMPLETED, label: '已完成', color: '#4caf50' },
    { value: TaskStatus.CANCELLED, label: '已取消', color: '#9e9e9e' }
  ];

  readonly priorityMap: Record<TaskPriority, { label: string; color: string }> = {
    [TaskPriority.LOW]: { label: '低', color: '#9e9e9e' },
    [TaskPriority.MEDIUM]: { label: '中', color: '#2196f3' },
    [TaskPriority.HIGH]: { label: '高', color: '#ff9800' },
    [TaskPriority.URGENT]: { label: '紧急', color: '#f44336' }
  };

  readonly filteredTasks = computed(() => {
    let result = this.tasks();

    if (this.selectedStatus() !== 'all') {
      result = result.filter(t => t.status === this.selectedStatus());
    }

    if (this.searchKeyword()) {
      const keyword = this.searchKeyword().toLowerCase();
      result = result.filter(t =>
        t.projectName.toLowerCase().includes(keyword) ||
        t.collatorName.toLowerCase().includes(keyword) ||
        t.dispatcherName.toLowerCase().includes(keyword)
      );
    }

    return result.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return new Date(b.createTime).getTime() - new Date(a.createTime).getTime();
    });
  });

  readonly statistics = computed(() => {
    const tasks = this.tasks();
    return {
      total: tasks.length,
      inProgress: tasks.filter(t => t.status === TaskStatus.IN_PROGRESS).length,
      completed: tasks.filter(t => t.status === TaskStatus.COMPLETED).length,
      cancelled: tasks.filter(t => t.status === TaskStatus.CANCELLED).length
    };
  });

  ngOnInit(): void {
    this.loadTasks();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 加载任务列表
   */
  loadTasks(): void {
    this.isLoading.set(true);

    const request$ = this.mode() === 'my'
      ? this.collationService.getMyTasks()
      : this.projectId()
        ? this.collationService.getProjectDispatches(this.projectId()!)
        : this.collationService.getMyTasks();

    request$.pipe(takeUntil(this.destroy$)).subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
      }
    });
  }

  /**
   * 按状态筛选
   */
  filterByStatus(status: TaskStatus | 'all'): void {
    this.selectedStatus.set(status);
  }

  /**
   * 搜索
   */
  search(): void {
    // 已通过computed自动过滤
  }

  /**
   * 重置搜索
   */
  resetSearch(): void {
    this.searchKeyword.set('');
    this.selectedStatus.set('all');
  }

  /**
   * 刷新列表
   */
  refresh(): void {
    this.loadTasks();
  }

  /**
   * 查看任务详情
   */
  viewTaskDetail(task: TaskDispatchVO): void {
    this.viewDetail.emit(task);
  }

  /**
   * 重新分派
   */
  onReassign(task: TaskDispatchVO): void {
    this.reassign.emit(task);
  }

  /**
   * 取消任务
   */
  cancelTask(task: TaskDispatchVO, reason?: string): void {
    if (!confirm(`确定要取消任务「${task.projectName} - ${task.pageCount}页」吗？`)) {
      return;
    }

    const request: TaskCancelRequest = { reason };
    this.collationService.cancelTask(task.id, request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadTasks();
        }
      });
  }

  /**
   * 开始勘校
   */
  startCollation(task: TaskDispatchVO): void {
    this.router.navigate(['/collation', task.projectId, 'workbench']);
  }

  /**
   * 获取状态标签
   */
  getStatusLabel(status: TaskStatus | 'all'): string {
    return this.statusOptions.find(s => s.value === status)?.label || '未知';
  }

  /**
   * 获取状态颜色
   */
  getStatusColor(status: TaskStatus): string {
    return this.statusOptions.find(s => s.value === status)?.color || '#9e9e9e';
  }

  /**
   * 获取优先级标签
   */
  getPriorityLabel(priority: TaskPriority): string {
    return this.priorityMap[priority]?.label || '中';
  }

  /**
   * 获取优先级颜色
   */
  getPriorityColor(priority: TaskPriority): string {
    return this.priorityMap[priority]?.color || '#2196f3';
  }

  /**
   * 获取进度条颜色
   */
  getProgressColor(progress: number): string {
    if (progress >= 100) return '#4caf50';
    if (progress >= 60) return '#2196f3';
    if (progress >= 30) return '#ff9800';
    return '#f44336';
  }

  /**
   * 格式化日期
   */
  formatDate(date: Date): string {
    const d = new Date(date);
    return d.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 检查是否即将到期
   */
  isDeadlineNear(deadline?: Date): boolean {
    if (!deadline) return false;
    const now = new Date();
    const deadlineDate = new Date(deadline);
    const diffHours = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60);
    return diffHours > 0 && diffHours <= 24;
  }

  /**
   * 检查是否已过期
   */
  isOverdue(deadline?: Date): boolean {
    if (!deadline) return false;
    return new Date(deadline) < new Date();
  }
}

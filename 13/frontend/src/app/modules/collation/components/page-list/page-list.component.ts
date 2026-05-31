// 页面列表组件

import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import {
  AncientPage,
  PageStatus,
  PageQueryParams,
  PaginatedResponse
} from '../../../../core/models/collation.model';
import { CollationService } from '../../services/collation.service';

@Component({
  selector: 'app-page-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './page-list.component.html',
  styleUrls: ['./page-list.component.scss']
})
export class PageListComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly collationService = inject(CollationService);
  private readonly destroy$ = new Subject<void>();

  // 分页参数
  private readonly queryParams = signal<PageQueryParams>({
    page: 1,
    pageSize: 20,
    status: undefined,
    keyword: ''
  });

  // 状态
  readonly pages = signal<AncientPage[]>([]);
  readonly total = signal(0);
  readonly isLoading = signal(false);
  readonly selectedStatus = signal<PageStatus | 'all'>('all');
  readonly searchKeyword = signal('');

  // 统计信息
  readonly statistics = signal<{
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    reviewed: number;
  }>({
    total: 0,
    pending: 0,
    inProgress: 0,
    completed: 0,
    reviewed: 0
  });

  // 计算属性
  readonly currentPage = computed(() => this.queryParams().page || 1);
  readonly pageSize = computed(() => this.queryParams().pageSize || 20);
  readonly totalPages = computed(() =>
    Math.ceil(this.total() / this.pageSize())
  );
  readonly hasPrevious = computed(() => this.currentPage() > 1);
  readonly hasNext = computed(() => this.currentPage() < this.totalPages());

  readonly pageStatusMap: Record<PageStatus | 'all', { label: string; color: string }> = {
  ['all' as PageStatus]: { label: '全部', color: '#666' },
  [PageStatus.PENDING]: { label: '待勘校', color: '#9e9e9e' },
  [PageStatus.IN_PROGRESS]: { label: '勘校中', color: '#ff9800' },
  [PageStatus.COMPLETED]: { label: '已完成', color: '#4caf50' },
  [PageStatus.REVIEWED]: { label: '已审核', color: '#2196f3' }
};

  ngOnInit(): void {
    this.loadPages();
    this.loadStatistics();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * 加载页面列表
   */
  loadPages(): void {
    this.isLoading.set(true);
    this.collationService
      .getPages({
        ...this.queryParams(),
        status: this.selectedStatus() === 'all' ? undefined : this.selectedStatus(),
        keyword: this.searchKeyword() || undefined
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response: PaginatedResponse<AncientPage>) => {
          this.pages.set(response.items);
          this.total.set(response.total);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  /**
   * 加载统计信息
   */
  loadStatistics(): void {
    this.collationService
      .getStatistics()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.statistics.set(stats);
        }
      });
  }

  /**
   * 状态筛选
   */
  filterByStatus(status: PageStatus | 'all'): void {
    this.selectedStatus.set(status);
    this.queryParams.update((prev) => ({ ...prev, page: 1 }));
    this.loadPages();
  }

  /**
   * 搜索
   */
  search(): void {
    this.queryParams.update((prev) => ({ ...prev, page: 1 }));
    this.loadPages();
  }

  /**
   * 重置搜索
   */
  resetSearch(): void {
    this.searchKeyword.set('');
    this.selectedStatus.set('all');
    this.queryParams.update((prev) => ({ ...prev, page: 1 }));
    this.loadPages();
  }

  /**
   * 跳转到指定页码
   */
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.queryParams.update((prev) => ({ ...prev, page }));
      this.loadPages();
    }
  }

  /**
   * 上一页
   */
  goToPrevious(): void {
    if (this.hasPrevious()) {
      this.goToPage(this.currentPage() - 1);
    }
  }

  /**
   * 下一页
   */
  goToNext(): void {
    this.goToPage(this.currentPage() + 1);
  }

  /**
   * 进入勘校工作台
   */
  openWorkbench(page: AncientPage): void {
    this.router.navigate(['/collation', page.projectId, 'workbench', {
      queryParams: { pageId: page.id }
    });
  }

  /**
   * 获取状态标签
   */
  getStatusLabel(status: PageStatus): string {
    return this.pageStatusMap[status]?.label || status;
  }

  /**
   * 获取状态颜色
   */
  getStatusColor(status: PageStatus): string {
    return this.pageStatusMap[status]?.color || '#9e9e9e';
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
   * 获取页码数组（用于分页显示）
   */
  getPageNumbers(): (number | string)[] {
    const current = this.currentPage();
    const total = this.totalPages();
    const pages: (number | string)[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) {
        pages.push(i);
      }
    } else {
      if (current <= 3) {
        pages.push(1, 2, 3, 4, '...', total);
      } else if (current >= total - 2) {
        pages.push(1, '...', total - 3, total - 2, total - 1, total);
      } else {
        pages.push(1, '...', current - 1, current, current + 1, '...', total);
      }
    }

    return pages;
  }
}

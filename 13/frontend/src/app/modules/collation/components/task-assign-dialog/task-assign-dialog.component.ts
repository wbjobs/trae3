// 批量分派对话框组件

import {
  Component,
  OnInit,
  signal,
  computed,
  inject,
  input,
  output
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import {
  AncientPage,
  TaskPriority,
  TaskBatchAssignRequest,
  TaskDispatchVO
} from '../../../../core/models/collation.model';
import { User } from '../../../../core/models/user.model';
import { CollationService } from '../../services/collation.service';

@Component({
  selector: 'app-task-assign-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './task-assign-dialog.component.html',
  styleUrls: ['./task-assign-dialog.component.scss']
})
export class TaskAssignDialogComponent implements OnInit {
  private readonly collationService = inject(CollationService);
  private readonly destroy$ = new Subject<void>();

  readonly projectId = input.required<string>();
  readonly visible = input(false);
  readonly selectedPages = input<AncientPage[]>([]);
  readonly visibleChange = output<boolean>();
  readonly assigned = output<TaskDispatchVO>();

  readonly pages = signal<AncientPage[]>([]);
  readonly collators = signal<User[]>([]);
  readonly isLoading = signal(false);
  readonly isSubmitting = signal(false);

  readonly selectedPageIds = signal<string[]>([]);
  readonly selectedCollatorId = signal<string>('');
  readonly selectedPriority = signal<TaskPriority>(TaskPriority.MEDIUM);
  readonly deadline = signal<string>('');
  readonly remark = signal<string>('');

  readonly priorityOptions = [
    { value: TaskPriority.LOW, label: '低', color: '#9e9e9e' },
    { value: TaskPriority.MEDIUM, label: '中', color: '#2196f3' },
    { value: TaskPriority.HIGH, label: '高', color: '#ff9800' },
    { value: TaskPriority.URGENT, label: '紧急', color: '#f44336' }
  ];

  readonly allSelected = computed(() => {
    return this.pages().length > 0 && this.selectedPageIds().length === this.pages().length;
  });

  readonly indeterminate = computed(() => {
    return this.selectedPageIds().length > 0 && this.selectedPageIds().length < this.pages().length;
  });

  readonly canSubmit = computed(() => {
    return this.selectedPageIds().length > 0 && this.selectedCollatorId();
  });

  ngOnInit(): void {
    this.loadPages();
    this.loadCollators();
  }

  /**
   * 加载待分配页面列表
   */
  loadPages(): void {
    this.isLoading.set(true);
    this.collationService
      .getProjectPages(this.projectId())
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (pages) => {
          const availablePages = pages.filter(p => p.status === 'pending');
          this.pages.set(availablePages);
          if (this.selectedPages().length > 0) {
            this.selectedPageIds.set(this.selectedPages().map(p => p.id));
          }
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  /**
   * 加载勘校员列表
   */
  loadCollators(): void {
    this.collators.set([
      {
        id: '1',
        username: 'collator1',
        email: 'collator1@example.com',
        nickname: '张三',
        role: 'collator' as any,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '2',
        username: 'collator2',
        email: 'collator2@example.com',
        nickname: '李四',
        role: 'collator' as any,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        id: '3',
        username: 'collator3',
        email: 'collator3@example.com',
        nickname: '王五',
        role: 'collator' as any,
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ]);
  }

  /**
   * 全选/取消全选
   */
  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedPageIds.set([]);
    } else {
      this.selectedPageIds.set(this.pages().map(p => p.id));
    }
  }

  /**
   * 切换页面选择
   */
  togglePage(pageId: string): void {
    this.selectedPageIds.update(ids => {
      if (ids.includes(pageId)) {
        return ids.filter(id => id !== pageId);
      } else {
        return [...ids, pageId];
      }
    });
  }

  /**
   * 检查页面是否被选中
   */
  isSelected(pageId: string): boolean {
    return this.selectedPageIds().includes(pageId);
  }

  /**
   * 获取优先级标签
   */
  getPriorityLabel(priority: TaskPriority): string {
    return this.priorityOptions.find(p => p.value === priority)?.label || '中';
  }

  /**
   * 获取优先级颜色
   */
  getPriorityColor(priority: TaskPriority): string {
    return this.priorityOptions.find(p => p.value === priority)?.color || '#2196f3';
  }

  /**
   * 获取勘校员姓名
   */
  getCollatorName(collatorId: string): string {
    return this.collators().find(c => c.id === collatorId)?.nickname || '';
  }

  /**
   * 提交分派
   */
  submit(): void {
    if (!this.canSubmit()) {
      return;
    }

    const collator = this.collators().find(c => c.id === this.selectedCollatorId());
    if (!collator) {
      return;
    }

    const request: TaskBatchAssignRequest = {
      projectId: this.projectId(),
      pageIds: this.selectedPageIds(),
      collatorId: this.selectedCollatorId(),
      collatorName: collator.nickname,
      priority: this.selectedPriority(),
      deadline: this.deadline() ? new Date(this.deadline()) : undefined,
      remark: this.remark() || undefined
    };

    this.isSubmitting.set(true);
    this.collationService
      .batchAssignTasks(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (result) => {
          this.isSubmitting.set(false);
          this.assigned.emit(result);
          this.close();
        },
        error: () => {
          this.isSubmitting.set(false);
        }
      });
  }

  /**
   * 关闭对话框
   */
  close(): void {
    this.visibleChange.emit(false);
    this.resetForm();
  }

  /**
   * 重置表单
   */
  resetForm(): void {
    this.selectedPageIds.set([]);
    this.selectedCollatorId.set('');
    this.selectedPriority.set(TaskPriority.MEDIUM);
    this.deadline.set('');
    this.remark.set('');
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
}

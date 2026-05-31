// 勘校工作台主组件

import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewInit,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, interval } from 'rxjs';
import * as OpenSeadragon from 'openseadragon';
import {
  AncientPage,
  CollationRecord,
  PageStatus,
  WorkbenchState,
  ShortcutConfig
} from '../../../../core/models/collation.model';
import { CollationService } from '../../services/collation.service';
import { HistoryPanelComponent } from '../history-panel/history-panel.component';
import { TextDiffComponent } from '../text-diff/text-diff.component';

interface ConflictInfo {
  show: boolean;
  message: string;
  canRetry: boolean;
  conflictUsers?: string[];
}

@Component({
  selector: 'app-collation-workbench',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HistoryPanelComponent,
    TextDiffComponent
  ],
  templateUrl: './collation-workbench.component.html',
  styleUrls: ['./collation-workbench.component.scss']
})
export class CollationWorkbenchComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collationService = inject(CollationService);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('openseadragonContainer')
  openseadragonContainer!: ElementRef;
  @ViewChild('textEditor') textEditor!: ElementRef<HTMLTextAreaElement>;

  private viewer: OpenSeadragon.Viewer | null = null;

  private readonly state = signal<WorkbenchState>({
    currentPage: null,
    pages: [],
    currentIndex: 0,
    isLoading: false,
    isSaving: false,
    history: [],
    showHistory: false,
    rotation: 0,
    zoom: 1
  });

  readonly currentPage = computed(() => this.state().currentPage);
  readonly pages = computed(() => this.state().pages);
  readonly currentIndex = computed(() => this.state().currentIndex);
  readonly isLoading = computed(() => this.state().isLoading);
  readonly isSaving = computed(() => this.state().isSaving);
  readonly history = computed(() => this.state().history);
  readonly showHistory = computed(() => this.state().showHistory);
  readonly rotation = computed(() => this.state().rotation);
  readonly zoom = computed(() => this.state().zoom);

  readonly editedText = signal('');
  readonly originalText = signal('');
  readonly showOcrText = signal(true);
  readonly showDiff = signal(false);
  readonly projectId = computed(() => this.route.snapshot.paramMap.get('projectId'));

  readonly conflictInfo = signal<ConflictInfo>({
    show: false,
    message: '',
    canRetry: false
  });

  readonly otherEditingUsers = signal<string[]>([]);
  private readonly autoRefreshInterval = 30000;

  readonly totalPages = computed(() => this.pages().length);
  readonly hasPrevious = computed(() => this.currentIndex() > 0);
  readonly hasNext = computed(() => this.currentIndex() < this.totalPages() - 1);

  readonly pageStatusMap: Record<PageStatus, { label: string; color: string }> = {
    [PageStatus.PENDING]: { label: '待勘校', color: '#9e9e9e' },
    [PageStatus.IN_PROGRESS]: { label: '勘校中', color: '#ff9800' },
    [PageStatus.COMPLETED]: { label: '已完成', color: '#4caf50' },
    [PageStatus.REVIEWED]: { label: '已审核', color: '#2196f3' }
  };

  readonly shortcuts: ShortcutConfig[] = [
    { key: 'Ctrl + S', description: '提交勘校', action: () => this.submitCollation() },
    { key: 'Ctrl + Z', description: '撤销修改', action: () => this.undoChanges() },
    { key: '←', description: '上一页', action: () => this.goToPreviousPage() },
    { key: '→', description: '下一页', action: () => this.goToNextPage() },
    { key: 'Ctrl + =', description: '放大图像', action: () => this.zoomIn() },
    { key: 'Ctrl + -', description: '缩小图像', action: () => this.zoomOut() },
    { key: 'Ctrl + R', description: '旋转图像', action: () => this.rotateImage() },
    { key: 'Ctrl + H', description: '显示/隐藏历史', action: () => this.toggleHistory() },
    { key: 'Ctrl + F', description: '全屏显示', action: () => this.toggleFullscreen() },
    { key: 'F5', description: '刷新页面', action: () => this.refreshCurrentPage() }
  ];

  readonly showShortcuts = signal(false);
  readonly comment = signal('');
  readonly markAsCompleted = signal(false);

  ngOnInit(): void {
    this.loadPages();
    this.setupKeyboardShortcuts();
    this.setupAutoRefresh();
    this.setupConflictNotification();
  }

  ngAfterViewInit(): void {
    this.initOpenSeadragon();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.viewer) {
      this.viewer.destroy();
    }
    document.removeEventListener('keydown', this.handleKeydown.bind(this));
  }

  private setupAutoRefresh(): void {
    interval(this.autoRefreshInterval)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        const page = this.currentPage();
        if (page) {
          this.checkPageVersion(page.id);
        }
      });
  }

  private setupConflictNotification(): void {
    console.debug('冲突通知监听器已初始化');
  }

  private checkPageVersion(pageId: string): void {
    this.collationService.getPageDetail(pageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          const currentPage = this.currentPage();
          if (currentPage && page.currentVersion > currentPage.currentVersion) {
            this.showConflictWarning(
              '页面已被其他用户更新，建议刷新页面获取最新版本',
              true
            );
          }
        }
      });
  }

  private showConflictWarning(message: string, canRetry: boolean = true): void {
    this.conflictInfo.set({
      show: true,
      message,
      canRetry,
      conflictUsers: ['其他用户']
    });
    console.warn('冲突警告:', message);
  }

  dismissConflict(): void {
    this.conflictInfo.set({
      show: false,
      message: '',
      canRetry: false
    });
  }

  refreshCurrentPage(): void {
    const page = this.currentPage();
    if (page) {
      this.dismissConflict();
      this.loadPageDetail(page.id);
    }
  }

  retrySubmit(): void {
    this.dismissConflict();
    this.submitCollation();
  }

  private loadPages(): void {
    const projectId = this.projectId();
    if (!projectId) return;

    this.setLoading(true);
    this.collationService
      .getProjectPages(projectId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (pages) => {
          this.state.update((prev) => ({ ...prev, pages }));
          if (pages.length > 0) {
            this.loadPageDetail(pages[0].id);
          }
          this.setLoading(false);
        },
        error: () => this.setLoading(false)
      });
  }

  private loadPageDetail(pageId: string): void {
    this.setLoading(true);
    this.dismissConflict();
    this.collationService
      .getPageDetail(pageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.state.update((prev) => ({
            ...prev,
            currentPage: page,
            currentIndex: prev.pages.findIndex((p) => p.id === pageId)
          }));
          this.editedText.set(page.collationText || page.ocrText);
          this.originalText.set(page.ocrText);
          this.loadHistory(pageId);
          this.updateViewerImage(page.imageUrl);
          this.setLoading(false);
        },
        error: (err) => {
          this.setLoading(false);
          this.handlePageLoadError(err);
        }
      });
  }

  private handlePageLoadError(error: any): void {
    const errorMessage = error.message || '加载页面失败';
    if (errorMessage.includes('并发冲突') || errorMessage.includes('其他用户')) {
      this.showConflictWarning(errorMessage, true);
    } else {
      console.error('页面加载错误:', errorMessage);
    }
  }

  private loadHistory(pageId: string): void {
    this.collationService
      .getPageHistory(pageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (history) => {
          this.state.update((prev) => ({ ...prev, history }));
        }
      });
  }

  private initOpenSeadragon(): void {
    if (!this.openseadragonContainer) return;

    this.viewer = OpenSeadragon({
      element: this.openseadragonContainer.nativeElement,
      prefixUrl: 'https://openseadragon.github.io/openseadragon/images/',
      showNavigationControl: true,
      showZoomControl: true,
      showFullPageControl: true,
      showHomeControl: true,
      showRotationControl: true,
      animationTime: 0.5,
      blendTime: 0.1,
      constrainDuringPan: true,
      visibilityRatio: 1,
      minZoomLevel: 0.5,
      maxZoomLevel: 20,
      defaultZoomLevel: 1
    });

    this.viewer.addHandler('zoom', (event) => {
      this.state.update((prev) => ({ ...prev, zoom: event.zoom }));
    });
  }

  private updateViewerImage(imageUrl: string): void {
    if (!this.viewer) return;

    this.viewer.open({
      type: 'image',
      url: imageUrl
    });

    this.state.update((prev) => ({ ...prev, rotation: 0, zoom: 1 }));
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 's':
          event.preventDefault();
          this.submitCollation();
          break;
        case 'z':
          event.preventDefault();
          this.undoChanges();
          break;
        case '=':
          event.preventDefault();
          this.zoomIn();
          break;
        case '-':
          event.preventDefault();
          this.zoomOut();
          break;
        case 'r':
          event.preventDefault();
          this.rotateImage();
          break;
        case 'h':
          event.preventDefault();
          this.toggleHistory();
          break;
        case 'f':
          event.preventDefault();
          this.toggleFullscreen();
          break;
      }
    } else if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      if (event.key === 'F5') {
        event.preventDefault();
        this.refreshCurrentPage();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        this.goToPreviousPage();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        this.goToNextPage();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        this.dismissConflict();
      }
    }
  }

  goToPage(index: number): void {
    const pages = this.pages();
    if (index >= 0 && index < pages.length) {
      this.loadPageDetail(pages[index].id);
    }
  }

  goToPreviousPage(): void {
    if (this.hasPrevious()) {
      this.goToPage(this.currentIndex() - 1);
    }
  }

  goToNextPage(): void {
    if (this.hasNext()) {
      this.goToPage(this.currentIndex() + 1);
    }
  }

  zoomIn(): void {
    if (this.viewer) {
      this.viewer.zoomBy(1.2);
    }
  }

  zoomOut(): void {
    if (this.viewer) {
      this.viewer.zoomBy(0.8);
    }
  }

  rotateImage(): void {
    if (this.viewer) {
      const newRotation = (this.rotation() + 90) % 360;
      this.viewer.setRotation(newRotation);
      this.state.update((prev) => ({ ...prev, rotation: newRotation }));
    }
  }

  resetView(): void {
    if (this.viewer) {
      this.viewer.goHome();
      this.viewer.setRotation(0);
      this.state.update((prev) => ({ ...prev, rotation: 0, zoom: 1 }));
    }
  }

  toggleFullscreen(): void {
    if (this.viewer) {
      this.viewer.setFullScreen(!this.viewer.isFullPage());
    }
  }

  submitCollation(): void {
    const page = this.currentPage();
    if (!page || this.isSaving()) return;

    if (this.conflictInfo().show) {
      console.warn('请先处理冲突后再提交');
      return;
    }

    this.setSaving(true);
    this.collationService
      .submitCollation({
        pageId: page.id,
        collationText: this.editedText(),
        comment: this.comment() || undefined,
        markAsCompleted: this.markAsCompleted()
      })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (record) => {
          this.loadPageDetail(page.id);
          this.comment.set('');
          this.markAsCompleted.set(false);
          this.setSaving(false);
          console.log('勘校提交成功');
        },
        error: (err) => {
          this.setSaving(false);
          this.handleSubmitError(err);
        }
      });
  }

  private handleSubmitError(error: any): void {
    const errorMessage = error.message || '提交失败';
    if (errorMessage.includes('并发冲突') ||
        errorMessage.includes('其他用户') ||
        errorMessage.includes('版本')) {
      this.showConflictWarning(errorMessage, true);
    } else if (errorMessage.includes('锁超时') || errorMessage.includes('稍后重试')) {
      this.conflictInfo.set({
        show: true,
        message: '服务器繁忙，请稍后重试',
        canRetry: true
      });
      console.warn('服务器繁忙，请稍后重试');
    } else {
      console.error('提交失败:', errorMessage);
    }
  }

  undoChanges(): void {
    const page = this.currentPage();
    if (page) {
      this.editedText.set(page.collationText || page.ocrText);
    }
  }

  toggleHistory(): void {
    this.state.update((prev) => ({ ...prev, showHistory: !prev.showHistory }));
  }

  toggleShortcuts(): void {
    this.showShortcuts.update((v) => !v);
  }

  toggleOcrText(): void {
    this.showOcrText.update((v) => !v);
  }

  toggleDiff(): void {
    this.showDiff.update((v) => !v);
  }

  restoreVersion(record: CollationRecord): void {
    this.editedText.set(record.correctedText);
  }

  private setLoading(loading: boolean): void {
    this.state.update((prev) => ({ ...prev, isLoading: loading }));
  }

  private setSaving(saving: boolean): void {
    this.state.update((prev) => ({ ...prev, isSaving: saving }));
  }

  getStatusLabel(status: PageStatus): string {
    return this.pageStatusMap[status]?.label || status;
  }

  getStatusColor(status: PageStatus): string {
    return this.pageStatusMap[status]?.color || '#9e9e9e';
  }

  goBack(): void {
    this.router.navigate(['/collation']);
  }
}

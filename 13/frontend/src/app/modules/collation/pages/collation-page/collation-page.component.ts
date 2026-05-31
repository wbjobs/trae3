// 勘校页面组件 - 路由容器组件

import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterOutlet } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CollationService } from '../../services/collation.service';
import { PageListComponent } from '../../components/page-list/page-list.component';
import { CollationWorkbenchComponent } from '../../components/collation-workbench/collation-workbench.component';
import { HistoryPanelComponent } from '../../components/history-panel/history-panel.component';
import { TextDiffComponent } from '../../components/text-diff/text-diff.component';
import {
  AncientPage,
  PageStatus,
  CollationRecord
} from '../../../../core/models/collation.model';
import { Project, ProjectStats } from '../../../../core/models/project.model';

@Component({
  selector: 'app-collation-page',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatSidenavModule,
    MatBadgeModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    PageListComponent,
    CollationWorkbenchComponent,
    HistoryPanelComponent,
    TextDiffComponent
  ],
  template: `
    <div class="collation-page">
      <mat-toolbar class="page-toolbar">
        <div class="toolbar-left">
          <button mat-icon-button (click)="goBack()" *ngIf="showBackButton()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1 class="page-title">
            <mat-icon class="title-icon">menu_book</mat-icon>
            {{ pageTitle() }}
          </h1>
        </div>

        <div class="toolbar-center" *ngIf="currentProject()">
          <div class="project-info">
            <span class="project-name">{{ currentProject()?.name }}</span>
            <span class="project-divider">|</span>
            <span class="page-progress">
              {{ completedPages() }} / {{ totalPages() }} 页已完成
            </span>
          </div>
        </div>

        <div class="toolbar-right">
          <div class="view-toggle" *ngIf="currentView() === 'workbench'">
            <button
              mat-button
              [class.active]="viewMode() === 'split'"
              (click)="setViewMode('split')"
              matTooltip="分栏视图"
            >
              <mat-icon>splitscreen</mat-icon>
            </button>
            <button
              mat-button
              [class.active]="viewMode() === 'image'"
              (click)="setViewMode('image')"
              matTooltip="仅图像"
            >
              <mat-icon>image</mat-icon>
            </button>
            <button
              mat-button
              [class.active]="viewMode() === 'text'"
              (click)="setViewMode('text')"
              matTooltip="仅文本"
            >
              <mat-icon>text_fields</mat-icon>
            </button>
          </div>

          <button
            mat-button
            [matBadge]="pendingCount()"
            matBadgeColor="warn"
            [matMenuTriggerFor]="statusMenu"
            *ngIf="currentView() === 'workbench'"
          >
            <mat-icon>filter_list</mat-icon>
            状态筛选
          </button>

          <button
            mat-button
            (click)="toggleHistory()"
            *ngIf="currentView() === 'workbench'"
          >
            <mat-icon>history</mat-icon>
            历史记录
          </button>

          <button
            mat-icon-button
            (click)="refreshData()"
            [disabled]="isLoading()"
          >
            <mat-icon [class.spinning]="isLoading()">refresh</mat-icon>
          </button>

          <button
            mat-raised-button
            color="primary"
            (click)="goToWorkbench()"
            *ngIf="currentView() === 'list' && selectedPages().length > 0"
          >
            <mat-icon>edit_note</mat-icon>
            开始勘校 ({{ selectedPages().length }})
          </button>
        </div>
      </mat-toolbar>

      <div class="status-filter-menu">
        <mat-menu #statusMenu="matMenu">
          <button mat-menu-item (click)="setStatusFilter(null)">
            <mat-icon>layers</mat-icon>
            全部状态
          </button>
          <button mat-menu-item (click)="setStatusFilter(PageStatus.PENDING)">
            <span class="status-dot pending"></span>
            待勘校 ({{ statusCounts().pending }})
          </button>
          <button mat-menu-item (click)="setStatusFilter(PageStatus.IN_PROGRESS)">
            <span class="status-dot in-progress"></span>
            勘校中 ({{ statusCounts().inProgress }})
          </button>
          <button mat-menu-item (click)="setStatusFilter(PageStatus.COMPLETED)">
            <span class="status-dot completed"></span>
            已完成 ({{ statusCounts().completed }})
          </button>
          <button mat-menu-item (click)="setStatusFilter(PageStatus.REVIEWED)">
            <span class="status-dot reviewed"></span>
            已审核 ({{ statusCounts().reviewed }})
          </button>
        </mat-menu>
      </div>

      <div class="page-content">
        <div class="loading-overlay" *ngIf="isLoading()">
          <mat-spinner diameter="48"></mat-spinner>
          <span>{{ loadingText() }}</span>
        </div>

        <ng-container *ngIf="currentView() === 'list'">
          <app-page-list
            [projectId]="projectId()"
            [statusFilter]="statusFilter()"
            [selectedPages]="selectedPages()"
            (pageSelected)="onPageSelected($event)"
            (pageDeselected)="onPageDeselected($event)"
            (startCollation)="onStartCollation($event)"
          ></app-page-list>
        </ng-container>

        <ng-container *ngIf="currentView() === 'workbench'">
          <div class="workbench-layout" [class]="viewMode()">
            <div class="left-panel" *ngIf="viewMode() !== 'text'">
              <app-collation-workbench
                [projectId]="projectId()"
                [initialPageId]="initialPageId()"
                [showHistory]="showHistory()"
                [viewMode]="viewMode()"
                (pageChanged)="onPageChanged($event)"
                (collationSubmitted)="onCollationSubmitted($event)"
                (closeHistory)="showHistory.set(false)"
              ></app-collation-workbench>
            </div>

            <div class="right-panel" *ngIf="viewMode() !== 'image'">
              <div class="text-editor-wrapper">
                <div class="editor-header">
                  <h3>勘校文本</h3>
                  <div class="editor-actions">
                    <button mat-button (click)="toggleDiff()">
                      <mat-icon>compare</mat-icon>
                      对比视图
                    </button>
                  </div>
                </div>
                <div class="editor-content" *ngIf="currentPage()">
                  <app-text-diff
                    *ngIf="showDiff()"
                    [oldText]="currentPage()?.ocrText || ''"
                    [newText]="currentPage()?.collationText || ''"
                    [diffMode]="'inline'"
                  ></app-text-diff>
                  <div class="text-display" *ngIf="!showDiff()">
                    {{ currentPage()?.collationText || currentPage()?.ocrText }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </ng-container>

        <ng-container *ngIf="currentView() === 'compare'">
          <div class="compare-layout">
            <div class="compare-header">
              <h2>版本对比</h2>
              <div class="compare-versions">
                <span>版本 {{ compareVersion1() }}</span>
                <mat-icon>arrow_forward</mat-icon>
                <span>版本 {{ compareVersion2() }}</span>
              </div>
            </div>
            <app-text-diff
              [oldText]="compareOldText()"
              [newText]="compareNewText()"
              [diffMode]="'side-by-side'"
            ></app-text-diff>
          </div>
        </ng-container>
      </div>

      <mat-sidenav
        #historySidenav
        mode="over"
        position="end"
        [opened]="showHistory()"
        (closed)="showHistory.set(false)"
        class="history-sidenav"
      >
        <app-history-panel
          [pageId]="currentPage()?.id"
          [records]="historyRecords()"
          (restoreVersion)="onRestoreVersion($event)"
          (close)="showHistory.set(false)"
        ></app-history-panel>
      </mat-sidenav>
    </div>
  `,
  styles: [`
    .collation-page {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: #f5f0e6;
    }

    .page-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: #fff;
      border-bottom: 1px solid #d4c9b5;
      padding: 0 16px;
      height: 64px;
      box-shadow: 0 1px 3px rgba(93, 78, 55, 0.1);

      .toolbar-left {
        display: flex;
        align-items: center;
        gap: 8px;

        .page-title {
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #5d4e37;
          font-family: 'Noto Serif SC', serif;

          .title-icon {
            color: #c84c3b;
          }
        }
      }

      .toolbar-center {
        flex: 1;
        display: flex;
        justify-content: center;

        .project-info {
          display: flex;
          align-items: center;
          gap: 12px;
          font-size: 14px;
          color: #6b5d4a;

          .project-name {
            font-weight: 500;
            color: #5d4e37;
          }

          .project-divider {
            color: #d4c9b5;
          }

          .page-progress {
            color: #8b7d65;
          }
        }
      }

      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 8px;

        .view-toggle {
          display: flex;
          background: #f5f0e6;
          border-radius: 4px;
          padding: 2px;
          margin-right: 8px;

          button {
            min-width: auto;
            padding: 4px 8px;
            line-height: 1;

            &.active {
              background: #fff;
              box-shadow: 0 1px 2px rgba(93, 78, 55, 0.15);
            }
          }
        }
      }
    }

    .status-filter-menu {
      .status-dot {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        margin-right: 8px;

        &.pending { background: #9e9e9e; }
        &.in-progress { background: #ff9800; }
        &.completed { background: #4caf50; }
        &.reviewed { background: #2196f3; }
      }
    }

    .page-content {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    .loading-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(245, 240, 230, 0.9);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      z-index: 100;
      color: #6b5d4a;
      font-size: 14px;
    }

    .workbench-layout {
      display: flex;
      height: 100%;
      gap: 1px;
      background: #d4c9b5;

      &.image .left-panel { flex: 1; }
      &.text .right-panel { flex: 1; }

      &.split {
        .left-panel,
        .right-panel {
          flex: 1;
          min-width: 0;
        }
      }

      .left-panel,
      .right-panel {
        background: #faf7f0;
        overflow: hidden;
      }
    }

    .text-editor-wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;

      .editor-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #fff;
        border-bottom: 1px solid #e5dccb;

        h3 {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
          color: #5d4e37;
          font-family: 'Noto Serif SC', serif;
        }
      }

      .editor-content {
        flex: 1;
        overflow-y: auto;
        padding: 20px;

        .text-display {
          font-family: 'Noto Serif SC', serif;
          font-size: 16px;
          line-height: 2;
          color: #2c2416;
          white-space: pre-wrap;
          word-break: break-all;
        }
      }
    }

    .compare-layout {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 20px;

      .compare-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;

        h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 600;
          color: #5d4e37;
          font-family: 'Noto Serif SC', serif;
        }

        .compare-versions {
          display: flex;
          align-items: center;
          gap: 8px;
          color: #6b5d4a;
          font-size: 14px;

          mat-icon {
            color: #c84c3b;
          }
        }
      }
    }

    .history-sidenav {
      width: 400px;
      background: #faf7f0;
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class CollationPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly collationService = inject(CollationService);
  private readonly destroy$ = new Subject<void>();

  readonly projectId = computed(() => this.route.snapshot.paramMap.get('projectId'));
  readonly pageId = computed(() => this.route.snapshot.paramMap.get('pageId'));

  readonly currentView = signal<'list' | 'workbench' | 'compare'>('list');
  readonly viewMode = signal<'split' | 'image' | 'text'>('split');
  readonly showHistory = signal(false);
  readonly showDiff = signal(false);
  readonly isLoading = signal(false);
  readonly loadingText = signal('加载中...');

  readonly currentProject = signal<Project | null>(null);
  readonly pages = signal<AncientPage[]>([]);
  readonly selectedPages = signal<string[]>([]);
  readonly currentPage = signal<AncientPage | null>(null);
  readonly initialPageId = signal<string | null>(null);
  readonly historyRecords = signal<CollationRecord[]>([]);

  readonly statusFilter = signal<PageStatus | null>(null);
  readonly statusCounts = signal({
    pending: 0,
    inProgress: 0,
    completed: 0,
    reviewed: 0
  });

  readonly compareVersion1 = signal(1);
  readonly compareVersion2 = signal(2);
  readonly compareOldText = signal('');
  readonly compareNewText = signal('');

  readonly totalPages = computed(() => this.pages().length);
  readonly completedPages = computed(() =>
    this.pages().filter(p => p.status === PageStatus.COMPLETED || p.status === PageStatus.REVIEWED).length
  );
  readonly pendingCount = computed(() =>
    this.pages().filter(p => p.status === PageStatus.PENDING).length
  );
  readonly showBackButton = computed(() => this.currentView() !== 'list');

  readonly pageTitle = computed(() => {
    switch (this.currentView()) {
      case 'list':
        return '书页列表';
      case 'workbench':
        return '勘校工作台';
      case 'compare':
        return '版本对比';
      default:
        return '勘校中心';
    }
  });

  readonly PageStatus = PageStatus;

  ngOnInit(): void {
    this.detectViewFromRoute();
    this.loadProjectData();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private detectViewFromRoute(): void {
    const url = this.route.snapshot.url.map(seg => seg.path).join('/');

    if (url.includes('workbench')) {
      this.currentView.set('workbench');
      this.initialPageId.set(this.pageId());
    } else if (url.includes('compare')) {
      this.currentView.set('compare');
    } else {
      this.currentView.set('list');
    }
  }

  private loadProjectData(): void {
    const pid = this.projectId();
    if (!pid) return;

    this.setLoading(true, '加载项目数据...');
    this.collationService
      .getProjectPages(pid)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (pages) => {
          this.pages.set(pages);
          this.calculateStatusCounts(pages);
          this.setLoading(false);
        },
        error: () => this.setLoading(false)
      });
  }

  private calculateStatusCounts(pages: AncientPage[]): void {
    const counts = {
      pending: 0,
      inProgress: 0,
      completed: 0,
      reviewed: 0
    };

    pages.forEach(page => {
      switch (page.status) {
        case PageStatus.PENDING:
          counts.pending++;
          break;
        case PageStatus.IN_PROGRESS:
          counts.inProgress++;
          break;
        case PageStatus.COMPLETED:
          counts.completed++;
          break;
        case PageStatus.REVIEWED:
          counts.reviewed++;
          break;
      }
    });

    this.statusCounts.set(counts);
  }

  goBack(): void {
    if (this.currentView() === 'workbench' || this.currentView() === 'compare') {
      this.currentView.set('list');
      this.router.navigate(['/collation']);
    } else {
      this.router.navigate(['/']);
    }
  }

  refreshData(): void {
    this.loadProjectData();
    if (this.currentView() === 'workbench' && this.currentPage()) {
      this.loadPageDetail(this.currentPage()!.id);
    }
  }

  private loadPageDetail(pageId: string): void {
    this.setLoading(true, '加载页面详情...');
    this.collationService
      .getPageDetail(pageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (page) => {
          this.currentPage.set(page);
          this.loadHistory(pageId);
          this.setLoading(false);
        },
        error: () => this.setLoading(false)
      });
  }

  private loadHistory(pageId: string): void {
    this.collationService
      .getPageHistory(pageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (records) => {
          this.historyRecords.set(records);
        }
      });
  }

  setViewMode(mode: 'split' | 'image' | 'text'): void {
    this.viewMode.set(mode);
  }

  setStatusFilter(status: PageStatus | null): void {
    this.statusFilter.set(status);
  }

  toggleHistory(): void {
    this.showHistory.update(v => !v);
  }

  toggleDiff(): void {
    this.showDiff.update(v => !v);
  }

  goToWorkbench(): void {
    const pid = this.projectId();
    if (!pid) return;

    const firstSelected = this.selectedPages()[0];
    if (firstSelected) {
      this.router.navigate(['/collation', pid, 'workbench'], {
        queryParams: { pageId: firstSelected }
      });
    } else {
      this.router.navigate(['/collation', pid, 'workbench']);
    }
    this.currentView.set('workbench');
  }

  onPageSelected(pageId: string): void {
    this.selectedPages.update(prev => [...prev, pageId]);
  }

  onPageDeselected(pageId: string): void {
    this.selectedPages.update(prev => prev.filter(id => id !== pageId));
  }

  onStartCollation(page: AncientPage): void {
    const pid = this.projectId();
    if (!pid) return;

    this.router.navigate(['/collation', pid, 'workbench'], {
      queryParams: { pageId: page.id }
    });
    this.currentView.set('workbench');
    this.initialPageId.set(page.id);
  }

  onPageChanged(page: AncientPage): void {
    this.currentPage.set(page);
    this.loadHistory(page.id);
  }

  onCollationSubmitted(record: CollationRecord): void {
    this.loadHistory(record.pageId);
    this.loadProjectData();
  }

  onRestoreVersion(record: CollationRecord): void {
    this.showHistory.set(false);
    this.collationService
      .getPageDetail(record.pageId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(page => {
        this.currentPage.set({
          ...page,
          collationText: record.correctedText
        });
      });
  }

  private setLoading(loading: boolean, text?: string): void {
    this.isLoading.set(loading);
    if (text) {
      this.loadingText.set(text);
    }
  }
}

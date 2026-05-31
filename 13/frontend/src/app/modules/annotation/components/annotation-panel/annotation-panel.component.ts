// 批注面板组件 - 右侧抽屉式面板，展示批注列表

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatBadgeModule } from '@angular/material/badge';
import {
  Subject,
  Subscription,
  debounceTime,
  takeUntil,
  switchMap,
  of,
  catchError,
  tap
} from 'rxjs';
import { AnnotationItemComponent } from '../annotation-item/annotation-item.component';
import { AnnotationEditorComponent } from '../annotation-editor/annotation-editor.component';
import { AnnotationService } from '../../services/annotation.service';
import { RealtimeAnnotationService } from '../../services/realtime-annotation.service';
import { AuthService } from '@core/services/auth.service';
import {
  Annotation,
  AnnotationStatus,
  AnnotationPriority,
  TextSelection,
  AnnotationFilter,
  AnnotationStats
} from '@core/models/annotation.model';

@Component({
  selector: 'app-annotation-panel',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatInputModule,
    MatChipsModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatSidenavModule,
    MatTabsModule,
    MatBadgeModule,
    DatePipe,
    AnnotationItemComponent,
    AnnotationEditorComponent
  ],
  template: `
    <mat-sidenav-container class="panel-container">
      <mat-sidenav
        #sidenav
        mode="over"
        position="end"
        [opened]="isOpen()"
        (closed)="onClose()"
        class="annotation-sidenav"
      >
        <div class="panel-header">
          <div class="header-left">
            <h2 class="panel-title">
              <mat-icon>comment_bank</mat-icon>
              批注管理
            </h2>
            <span class="annotation-count" *ngIf="stats()">
              共 {{ stats()?.total || 0 }} 条批注
            </span>
          </div>
          <div class="header-right">
            <button
              mat-icon-button
              (click)="refreshAnnotations()"
              [disabled]="isLoading()"
              matTooltip="刷新"
            >
              <mat-icon [class.spinning]="isLoading()">refresh</mat-icon>
            </button>
            <button
              mat-icon-button
              (click)="onClose()"
              matTooltip="关闭"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>

        <div class="stats-bar" *ngIf="stats()">
          <div class="stat-item">
            <span class="stat-value open">{{ stats()?.open || 0 }}</span>
            <span class="stat-label">打开</span>
          </div>
          <div class="stat-item">
            <span class="stat-value resolved">{{ stats()?.resolved || 0 }}</span>
            <span class="stat-label">已解决</span>
          </div>
          <div class="stat-item">
            <span class="stat-value closed">{{ stats()?.closed || 0 }}</span>
            <span class="stat-label">已关闭</span>
          </div>
          <div class="stat-item">
            <span class="stat-value mentions">{{ stats()?.mentions || 0 }}</span>
            <span class="stat-label">@我</span>
          </div>
        </div>

        <div class="quick-add-section" *ngIf="currentSelection()">
          <app-annotation-editor
            mode="create"
            [projectId]="projectId()"
            [documentId]="documentId()"
            [selection]="currentSelection()"
            (cancel)="clearSelection()"
            (submitSuccess)="onAnnotationCreated($event)"
          ></app-annotation-editor>
        </div>

        <div class="quick-add-btn-wrapper" *ngIf="!currentSelection() && canQuickAdd()">
          <button
            mat-raised-button
            color="primary"
            class="quick-add-btn"
            (click)="showQuickAddHint()"
          >
            <mat-icon>add_comment</mat-icon>
            选中文本后可快速添加批注
          </button>
        </div>

        <div class="filter-section">
          <div class="filter-row">
            <mat-form-field appearance="outline" class="search-input">
              <mat-label>搜索批注</mat-label>
              <input
                matInput
                [formControl]="searchControl"
                placeholder="输入关键词搜索..."
              />
              <mat-icon matPrefix>search</mat-icon>
            </mat-form-field>
          </div>

          <div class="filter-row filters">
            <mat-form-field appearance="outline" class="filter-input">
              <mat-label>状态</mat-label>
              <mat-select [formControl]="statusFilter" multiple>
                <mat-option [value]="AnnotationStatus.OPEN">打开</mat-option>
                <mat-option [value]="AnnotationStatus.RESOLVED">已解决</mat-option>
                <mat-option [value]="AnnotationStatus.CLOSED">已关闭</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="filter-input">
              <mat-label>优先级</mat-label>
              <mat-select [formControl]="priorityFilter" multiple>
                <mat-option [value]="AnnotationPriority.LOW">低</mat-option>
                <mat-option [value]="AnnotationPriority.MEDIUM">中</mat-option>
                <mat-option [value]="AnnotationPriority.HIGH">高</mat-option>
                <mat-option [value]="AnnotationPriority.URGENT">紧急</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="filter-input">
              <mat-label>作者</mat-label>
              <mat-select [formControl]="authorFilter">
                <mat-option [value]="null">全部</mat-option>
                <mat-option [value]="'me'">我创建的</mat-option>
                <mat-option [value]="'others'">其他人创建的</mat-option>
              </mat-select>
            </mat-form-field>

            <mat-form-field appearance="outline" class="filter-input">
              <mat-label>排序</mat-label>
              <mat-select [formControl]="sortControl">
                <mat-option value="createdAt-desc">最新创建</mat-option>
                <mat-option value="createdAt-asc">最早创建</mat-option>
                <mat-option value="updatedAt-desc">最新更新</mat-option>
                <mat-option value="priority-desc">优先级最高</mat-option>
                <mat-option value="replyCount-desc">回复最多</mat-option>
              </mat-select>
            </mat-form-field>
          </div>

          <div class="filter-tags">
            <button
              mat-chip
              *ngIf="hasActiveFilters()"
              (click)="clearFilters()"
              class="clear-filters-chip"
            >
              <mat-icon>filter_alt_off</mat-icon>
              清除所有筛选
            </button>
          </div>
        </div>

        <div class="annotation-list-container">
          <div class="loading-indicator" *ngIf="isLoading()">
            <mat-spinner diameter="32"></mat-spinner>
            <span>加载批注中...</span>
          </div>

          <div class="empty-state" *ngIf="!isLoading() && annotations().length === 0">
            <mat-icon class="empty-icon">comment_disabled</mat-icon>
            <h3>暂无批注</h3>
            <p *ngIf="canQuickAdd()">选中文本并点击批注按钮添加第一条批注</p>
            <p *ngIf="!canQuickAdd()">当前文档还没有任何批注</p>
          </div>

          <div
            class="annotation-list"
            *ngIf="!isLoading() && annotations().length > 0"
            infiniteScroll
            [infiniteScrollDistance]="2"
            [infiniteScrollThrottle]="300"
            (scrolled)="onScroll()"
          >
            <app-annotation-item
              *ngFor="let annotation of annotations()"
              [annotation]="annotation"
              [isRead]="isAnnotationRead(annotation)"
              (navigateToSelection)="onNavigateToSelection($event)"
              (deleted)="onAnnotationDeleted($event)"
              (updated)="onAnnotationUpdated($event)"
            ></app-annotation-item>

            <div class="loading-more" *ngIf="isLoadingMore()">
              <mat-spinner diameter="20"></mat-spinner>
              <span>加载更多...</span>
            </div>

            <div class="no-more" *ngIf="hasMore() === false && annotations().length > 0">
              没有更多批注了
            </div>
          </div>
        </div>

        <div class="panel-footer">
          <button
            mat-button
            (click)="markAllAsRead()"
            [disabled]="unreadCount() === 0"
          >
            <mat-icon>mark_email_read</mat-icon>
            全部标记已读 ({{ unreadCount() }})
          </button>
          <button
            mat-button
            (click)="exportAnnotations()"
            [disabled]="annotations().length === 0"
          >
            <mat-icon>download</mat-icon>
            导出批注
          </button>
        </div>
      </mat-sidenav>
    </mat-sidenav-container>

    <div
      class="floating-trigger"
      *ngIf="!isOpen() && canQuickAdd()"
      (click)="open()"
    >
      <button
        mat-fab
        color="primary"
        matBadge="{{ stats()?.total || 0 }}"
        matBadgePosition="above before"
        matTooltip="打开批注面板"
      >
        <mat-icon>comment</mat-icon>
      </button>
    </div>
  `,
  styles: [
    `
      .panel-container {
        position: fixed;
        top: 0;
        right: 0;
        bottom: 0;
        z-index: 100;
        pointer-events: none;
      }

      .annotation-sidenav {
        width: 420px;
        max-width: 100vw;
        pointer-events: auto;
        background: #faf7f0;
        display: flex;
        flex-direction: column;
      }

      .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: #fff;
        border-bottom: 1px solid #d4c9b5;

        .header-left {
          display: flex;
          align-items: center;
          gap: 12px;

          .panel-title {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #5d4e37;
            font-family: 'Noto Serif SC', serif;

            mat-icon {
              color: #c84c3b;
            }
          }

          .annotation-count {
            font-size: 13px;
            color: #9b8f7a;
          }
        }

        .header-right {
          display: flex;
          gap: 4px;
        }
      }

      .stats-bar {
        display: flex;
        padding: 12px 20px;
        background: #fff;
        border-bottom: 1px solid #e5dccb;

        .stat-item {
          flex: 1;
          text-align: center;

          .stat-value {
            display: block;
            font-size: 20px;
            font-weight: 700;
            margin-bottom: 2px;

            &.open {
              color: #3b6c8c;
            }
            &.resolved {
              color: #4a7c59;
            }
            &.closed {
              color: #8c6b6b;
            }
            &.mentions {
              color: #c84c3b;
            }
          }

          .stat-label {
            font-size: 11px;
            color: #9b8f7a;
          }
        }
      }

      .quick-add-section {
        padding: 16px 20px;
        background: #fff;
        border-bottom: 1px solid #e5dccb;
      }

      .quick-add-btn-wrapper {
        padding: 12px 20px;
        background: #fff;
        border-bottom: 1px solid #e5dccb;

        .quick-add-btn {
          width: 100%;
          justify-content: center;
          gap: 8px;
        }
      }

      .filter-section {
        padding: 12px 20px;
        background: #fff;
        border-bottom: 1px solid #e5dccb;

        .filter-row {
          margin-bottom: 8px;

          &:last-child {
            margin-bottom: 0;
          }

          &.filters {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
          }
        }

        .search-input {
          width: 100%;
        }

        .filter-input {
          width: 100%;
        }

        .filter-tags {
          margin-top: 8px;

          .clear-filters-chip {
            background: #f5f0e6;
            color: #6b5d4a;

            &:hover {
              background: #e5dccb;
            }
          }
        }
      }

      .annotation-list-container {
        flex: 1;
        overflow-y: auto;
        padding: 16px 20px;

        .loading-indicator {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          color: #9b8f7a;
          gap: 12px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 40px 20px;
          text-align: center;

          .empty-icon {
            font-size: 48px;
            width: 48px;
            height: 48px;
            color: #d4c9b5;
            margin-bottom: 16px;
          }

          h3 {
            margin: 0 0 8px 0;
            font-size: 16px;
            color: #6b5d4a;
            font-family: 'Noto Serif SC', serif;
          }

          p {
            margin: 0;
            font-size: 13px;
            color: #9b8f7a;
          }
        }

        .annotation-list {
          .loading-more {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            padding: 16px;
            font-size: 13px;
            color: #9b8f7a;
          }

          .no-more {
            text-align: center;
            padding: 16px;
            font-size: 12px;
            color: #9b8f7a;
          }
        }
      }

      .panel-footer {
        display: flex;
        justify-content: space-between;
        padding: 12px 20px;
        background: #fff;
        border-top: 1px solid #e5dccb;

        button {
          color: #6b5d4a;
        }
      }

      .floating-trigger {
        position: fixed;
        bottom: 32px;
        right: 32px;
        z-index: 99;
        pointer-events: auto;
        cursor: pointer;

        button {
          box-shadow: 0 4px 12px rgba(93, 78, 55, 0.3);
        }
      }

      .spinning {
        animation: spin 1s linear infinite;
      }

      @keyframes spin {
        from
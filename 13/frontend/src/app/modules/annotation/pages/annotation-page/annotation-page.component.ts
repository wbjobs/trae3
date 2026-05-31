// 批注管理页面组件

import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormControl,
  FormsModule,
  ReactiveFormsModule
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil, debounceTime, switchMap, of } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatTabsModule } from '@angular/material/tabs';
import { MatSelectModule } from '@angular/material/select';
import { MatInputModule } from '@angular/material/input';
import { MatChipsModule } from '@angular/material/chips';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AnnotationService } from '../../services/annotation.service';
import { RealtimeAnnotationService } from '../../services/realtime-annotation.service';
import { AnnotationItemComponent } from '../../components/annotation-item/annotation-item.component';
import { AnnotationEditorComponent } from '../../components/annotation-editor/annotation-editor.component';
import { MentionDropdownComponent } from '../../components/mention-dropdown/mention-dropdown.component';
import { AnnotationPanelComponent } from '../../components/annotation-panel/annotation-panel.component';
import {
  Annotation,
  AnnotationStatus,
  AnnotationPriority,
  AnnotationFilter,
  AnnotationStats,
  AnnotationNotification,
  TextSelection
} from '../../../../core/models/annotation.model';
import { User } from '../../../../core/models/user.model';

@Component({
  selector: 'app-annotation-page',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatToolbarModule,
    MatSidenavModule,
    MatTabsModule,
    MatSelectModule,
    MatInputModule,
    MatChipsModule,
    MatBadgeModule,
    MatMenuModule,
    MatCardModule,
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    AnnotationItemComponent,
    AnnotationEditorComponent,
    MentionDropdownComponent,
    AnnotationPanelComponent
  ],
  template: `
    <div class="annotation-page">
      <mat-toolbar class="page-toolbar">
        <div class="toolbar-left">
          <button mat-icon-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1 class="page-title">
            <mat-icon class="title-icon">comment_bank</mat-icon>
            批注管理
          </h1>
        </div>

        <div class="toolbar-center">
          <div class="connection-status" *ngIf="realtimeService.isConnected()">
            <span class="status-dot connected"></span>
            <span class="status-text">实时同步已连接</span>
            <span class="online-count">
              ({{ realtimeService.onlineUsers().length }} 人在线)
            </span>
          </div>
          <div class="connection-status" *ngIf="!realtimeService.isConnected()">
            <span class="status-dot disconnected"></span>
            <span class="status-text">实时同步已断开</span>
            <button mat-button (click)="reconnect()">重新连接</button>
          </div>
        </div>

        <div class="toolbar-right">
          <button
            mat-icon-button
            [matBadge]="unreadCount()"
            matBadgeColor="warn"
            [matMenuTriggerFor]="notificationMenu"
            matTooltip="通知"
          >
            <mat-icon>notifications</mat-icon>
          </button>

          <button
            mat-icon-button
            (click)="refreshAnnotations()"
            [disabled]="isLoading()"
            matTooltip="刷新"
          >
            <mat-icon [class.spinning]="isLoading()">refresh</mat-icon>
          </button>

          <button
            mat-raised-button
            color="primary"
            (click)="openCreateDialog()"
          >
            <mat-icon>add_comment</mat-icon>
            新建批注
          </button>
        </div>
      </mat-toolbar>

      <mat-menu #notificationMenu="matMenu" class="notification-menu">
        <div class="notification-header">
          <span>通知</span>
          <button mat-button (click)="markAllNotificationsRead()">
            全部已读
          </button>
        </div>
        <div class="notification-list">
          <div
            class="notification-item"
            *ngFor="let notification of notifications()"
            [class.unread]="!notification.isRead"
          >
            <div class="notification-icon">
              <mat-icon>{{ getNotificationIcon(notification.type) }}</mat-icon>
            </div>
            <div class="notification-content">
              <div class="notification-title">
                {{ getNotificationTitle(notification) }}
              </div>
              <div class="notification-time">
                {{ notification.createdAt | date: 'yyyy-MM-dd HH:mm' }}
              </div>
            </div>
          </div>
          <div class="notification-empty" *ngIf="notifications().length === 0">
            暂无通知
          </div>
        </div>
      </mat-menu>

      <div class="page-content">
        <div class="sidebar">
          <div class="stats-card ancient-card">
            <h3 class="card-title">统计概览</h3>
            <div class="stats-grid" *ngIf="stats()">
              <div class="stat-item">
                <span class="stat-value total">{{ stats()?.total || 0 }}</span>
                <span class="stat-label">总计</span>
              </div>
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
                <span class="stat-value my">{{ stats()?.myAnnotations || 0 }}</span>
                <span class="stat-label">我的</span>
              </div>
              <div class="stat-item">
                <span class="stat-value assigned">{{ stats()?.assignedToMe || 0 }}</span>
                <span class="stat-label">指派给我</span>
              </div>
            </div>
          </div>

          <div class="filter-card ancient-card">
            <h3 class="card-title">筛选条件</h3>

            <div class="filter-section">
              <label class="filter-label">状态</label>
              <div class="filter-options">
                <mat-checkbox
                  *ngFor="let status of statusOptions"
                  [checked]="isStatusSelected(status.value)"
                  (change)="toggleStatusFilter(status.value)"
                >
                  <span class="status-badge" [class]="status.value">
                    {{ status.label }}
                  </span>
                </mat-checkbox>
              </div>
            </div>

            <div class="filter-section">
              <label class="filter-label">优先级</label>
              <div class="filter-options">
                <mat-checkbox
                  *ngFor="let priority of priorityOptions"
                  [checked]="isPrioritySelected(priority.value)"
                  (change)="togglePriorityFilter(priority.value)"
                >
                  <span class="priority-badge" [class]="priority.value">
                    {{ priority.label }}
                  </span>
                </mat-checkbox>
              </div>
            </div>

            <div class="filter-section">
              <label class="filter-label">作者</label>
              <mat-form-field appearance="outline" class="filter-input">
                <mat-select [formControl]="authorFilter">
                  <mat-option [value]="null">全部</mat-option>
                  <mat-option value="me">我创建的</mat-option>
                  <mat-option value="others">其他人创建的</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <div class="filter-section">
              <label class="filter-label">指派人</label>
              <mat-form-field appearance="outline" class="filter-input">
                <mat-select [formControl]="assigneeFilter">
                  <mat-option [value]="null">全部</mat-option>
                  <mat-option value="me">指派给我</mat-option>
                  <mat-option value="others">指派给其他人</mat-option>
                </mat-select>
              </mat-form-field>
            </div>

            <div class="filter-section">
              <label class="filter-label">标签</label>
              <mat-form-field appearance="outline" class="filter-input">
                <input
                  matInput
                  [formControl]="tagFilter"
                  placeholder="输入标签筛选"
                />
              </mat-form-field>
            </div>

            <div class="filter-section">
              <label class="filter-label">日期范围</label>
              <div class="date-range">
                <mat-form-field appearance="outline" class="filter-input date-input">
                  <input
                    matInput
                    [matDatepicker]="startPicker"
                    [formControl]="startDateFilter"
                    placeholder="开始日期"
                  />
                  <mat-datepicker-toggle matSuffix [for]="startPicker"></mat-datepicker-toggle>
                  <mat-datepicker #startPicker></mat-datepicker>
                </mat-form-field>
                <span class="date-separator">至</span>
                <mat-form-field appearance="outline" class="filter-input date-input">
                  <input
                    matInput
                    [matDatepicker]="endPicker"
                    [formControl]="endDateFilter"
                    placeholder="结束日期"
                  />
                  <mat-datepicker-toggle matSuffix [for]="endPicker"></mat-datepicker-toggle>
                  <mat-datepicker #endPicker></mat-datepicker>
                </mat-form-field>
              </div>
            </div>

            <div class="filter-actions">
              <button mat-button (click)="clearFilters()">
                <mat-icon>filter_alt_off</mat-icon>
                清除筛选
              </button>
              <button mat-raised-button color="primary" (click)="applyFilters()">
                <mat-icon>filter_alt</mat-icon>
                应用筛选
              </button>
            </div>
          </div>

          <div class="sort-card ancient-card">
            <h3 class="card-title">排序方式</h3>
            <mat-form-field appearance="outline" class="filter-input">
              <mat-select [formControl]="sortControl">
                <mat-option value="createdAt-desc">最新创建</mat-option>
                <mat-option value="createdAt-asc">最早创建</mat-option>
                <mat-option value="updatedAt-desc">最新更新</mat-option>
                <mat-option value="updatedAt-asc">最早更新</mat-option>
                <mat-option value="priority-desc">优先级最高</mat-option>
                <mat-option value="priority-asc">优先级最低</mat-option>
                <mat-option value="replyCount-desc">回复最多</mat-option>
                <mat-option value="replyCount-asc">回复最少</mat-option>
              </mat-select>
            </mat-form-field>
          </div>
        </div>

        <div class="main-content">
          <div class="content-header">
            <div class="search-bar">
              <mat-form-field appearance="outline" class="search-input">
                <mat-label>搜索批注</mat-label>
                <input
                  matInput
                  [formControl]="searchControl"
                  placeholder="输入关键词搜索批注内容..."
                />
                <mat-icon matPrefix>search</mat-icon>
                <button
                  mat-icon-button
                  matSuffix
                  *ngIf="searchControl.value"
                  (click)="searchControl.setValue('')"
                >
                  <mat-icon>close</mat-icon>
                </button>
              </mat-form-field>
            </div>

            <div class="view-toggle">
              <button
                mat-button
                [class.active]="viewMode() === 'list'"
                (click)="setViewMode('list')"
                matTooltip="列表视图"
              >
                <mat-icon>list</mat-icon>
              </button>
              <button
                mat-button
                [class.active]="viewMode() === 'card'"
                (click)="setViewMode('card')"
                matTooltip="卡片视图"
              >
                <mat-icon>grid_view</mat-icon>
              </button>
            </div>
          </div>

          <div class="content-tabs">
            <mat-tab-group [selectedIndex]="activeTabIndex()" (selectedTabChange)="onTabChange($event)">
              <mat-tab label="全部">
                <ng-template matTabContent>
                  <div class="result-count">
                    共 {{ totalCount() }} 条批注
                  </div>
                </ng-template>
              </mat-tab>
              <mat-tab [label]="'打开 (' + (stats()?.open || 0) + ')'">
                <ng-template matTabContent></ng-template>
              </mat-tab>
              <mat-tab [label]="'已解决 (' + (stats()?.resolved || 0) + ')'">
                <ng-template matTabContent></ng-template>
              </mat-tab>
              <mat-tab [label]="'已关闭 (' + (stats()?.closed || 0) + ')'">
                <ng-template matTabContent></ng-template>
              </mat-tab>
              <mat-tab label="@我的">
                <ng-template matTabContent></ng-template>
              </mat-tab>
            </mat-tab-group>
          </div>

          <div class="annotations-container">
            <div class="loading-overlay" *ngIf="isLoading()">
              <mat-spinner diameter="48"></mat-spinner>
              <span>加载批注中...</span>
            </div>

            <div class="empty-state" *ngIf="!isLoading() && annotations().length === 0">
              <mat-icon class="empty-icon">comment_disabled</mat-icon>
              <h3>暂无批注</h3>
              <p>还没有符合条件的批注，点击上方按钮创建第一条批注</p>
            </div>

            <div
              class="annotations-list"
              *ngIf="!isLoading() && annotations().length > 0"
              [class.list-view]="viewMode() === 'list'"
              [class.card-view]="viewMode() === 'card'"
            >
              <app-annotation-item
                *ngFor="let annotation of annotations()"
                [annotation]="annotation"
                [isRead]="isAnnotationRead(annotation)"
                [viewMode]="viewMode()"
                (navigateToSelection)="onNavigateToSelection($event)"
                (deleted)="onAnnotationDeleted($event)"
                (updated)="onAnnotationUpdated($event)"
              ></app-annotation-item>
            </div>

            <div class="pagination" *ngIf="totalPages() > 1">
              <button
                mat-button
                (click)="prevPage()"
                [disabled]="currentPage() <= 1"
              >
                <mat-icon>chevron_left</mat-icon>
                上一页
              </button>

              <div class="page-info">
                第 {{ currentPage() }} / {{ totalPages() }} 页
              </div>

              <button
                mat-button
                (click)="nextPage()"
                [disabled]="currentPage() >= totalPages()"
              >
                下一页
                <mat-icon>chevron_right</mat-icon>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="create-dialog-overlay" *ngIf="showCreateDialog()">
        <div class="create-dialog ancient-card">
          <div class="dialog-header">
            <h2>新建批注</h2>
            <button mat-icon-button (click)="closeCreateDialog()">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="dialog-content">
            <app-annotation-editor
              mode="create"
              [projectId]="projectId()"
              [documentId]="documentId()"
              [selection]="currentSelection()"
              (cancel)="closeCreateDialog()"
              (submitSuccess)="onAnnotationCreated($event)"
            ></app-annotation-editor>
          </div>
        </div>
      </div>

      <app-annotation-panel
        [isOpen]="showPanel()"
        [projectId]="projectId()"
        [documentId]="documentId()"
        [currentSelection]="currentSelection()"
        (close)="showPanel.set(false)"
        (annotationCreated)="onAnnotationCreated($event)"
      ></app-annotation-panel>
    </div>
  `,
  styles: [`
    .annotation-page {
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
        .connection-status {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 13px;
          color: #6b5d4a;

          .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;

            &.connected {
              background: #4a7c59;
              animation: pulse 2s infinite;
            }

            &.disconnected {
              background: #c84c3b;
            }
          }

          .status-text {
            font-weight: 500;
          }

          .online-count {
            color: #8b7d65;
          }

          button {
            margin-left: 8px;
          }
        }
      }

      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    }

    .notification-menu {
      width: 360px;

      .notification-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid #e5dccb;
        font-weight: 600;
        color: #5d4e37;

        button {
          font-size: 12px;
        }
      }

      .notification-list {
        max-height: 400px;
        overflow-y: auto;

        .notification-item {
          display: flex;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid #f5f0e6;
          cursor: pointer;
          transition: background-color 0.2s;

          &:hover {
            background: #faf7f0;
          }

          &.unread {
            background: #fef7f5;

            .notification-title {
              font-weight: 600;
            }
          }

          .notification-icon {
            color: #c84c3b;

            mat-icon {
              font-size: 24px;
              width: 24px;
              height: 24px;
            }
          }

          .notification-content {
            flex: 1;

            .notification-title {
              font-size: 13px;
              color: #2c2416;
              margin-bottom: 4px;
            }

            .notification-time {
              font-size: 11px;
              color: #9b8f7a;
            }
          }
        }

        .notification-empty {
          padding: 40px 20px;
          text-align: center;
          color: #9b8f7a;
          font-size: 13px;
        }
      }
    }

    .page-content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    .sidebar {
      width: 320px;
      padding: 20px;
      overflow-y: auto;
      background: #f5f0e6;
      border-right: 1px solid #d4c9b5;

      .ancient-card {
        margin-bottom: 20px;

        &:last-child {
          margin-bottom: 0;
        }
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-top: 12px;

        .stat-item {
          text-align: center;
          padding: 12px 8px;
          background: #faf7f0;
          border-radius: 4px;
          border: 1px solid #e5dccb;

          .stat-value {
            display: block;
            font-size: 24px;
            font-weight: 700;
            margin-bottom: 4px;

            &.total { color: #5d4e37; }
            &.open { color: #3b6c8c; }
            &.resolved { color: #4a7c59; }
            &.closed { color: #8c6b6b; }
            &.my { color: #c89b3b; }
            &.assigned { color: #c84c3b; }
          }

          .stat-label {
            font-size: 11px;
            color: #6b5d4a;
          }
        }
      }

      .filter-section {
        margin-bottom: 16px;

        &:last-child {
          margin-bottom: 0;
        }

        .filter-label {
          display: block;
          font-size: 13px;
          font-weight: 600;
          color: #5d4e37;
          margin-bottom: 8px;
        }

        .filter-options {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .status-badge,
        .priority-badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 12px;
          font-weight: 500;
        }

        .status-badge {
          &.OPEN { background: #e3f0f8; color: #3b6c8c; }
          &.RESOLVED { background: #e8f3ea; color: #4a7c59; }
          &.CLOSED { background: #f3e8e8; color: #8c6b6b; }
        }

        .priority-badge {
          &.LOW { background: #e8f0e8; color: #6b8c6b; }
          &.MEDIUM { background: #f8f3e3; color: #c89b3b; }
          &.HIGH { background: #fbe8e8; color: #c86b3b; }
          &.URGENT { background: #fbe0e0; color: #c84c3b; }
        }

        .filter-input {
          width: 100%;

          &.date-input {
            flex: 1;
          }
        }

        .date-range {
          display: flex;
          align-items: center;
          gap: 8px;

          .date-separator {
            color: #9b8f7a;
          }
        }
      }

      .filter-actions {
        display: flex;
        gap: 8px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #e5dccb;

        button {
          flex: 1;
          justify-content: center;
        }
      }
    }

    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #faf7f0;

      .content-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: #fff;
        border-bottom: 1px solid #e5dccb;
        gap: 16px;

        .search-bar {
          flex: 1;
          max-width: 600px;

          .search-input {
            width: 100%;
          }
        }

        .view-toggle {
          display: flex;
          background: #f5f0e6;
          border-radius: 4px;
          padding: 2px;

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

      .content-tabs {
        background: #fff;
        border-bottom: 1px solid #e5dccb;

        ::ng-deep .mat-mdc-tab-header {
          padding: 0 20px;
        }

        .result-count {
          padding: 12px 0;
          color: #6b5d4a;
          font-size: 13px;
        }
      }

      .annotations-container {
        flex: 1;
        position: relative;
        overflow-y: auto;
        padding: 20px;

        .loading-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(250, 247, 240, 0.9);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 16px;
          z-index: 10;
          color: #6b5d4a;
          font-size: 14px;
        }

        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 60px 20px;
          text-align: center;

          .empty-icon {
            font-size: 64px;
            width: 64px;
            height: 64px;
            color: #d4c9b5;
            margin-bottom: 20px;
          }

          h3 {
            margin: 0 0 8px 0;
            font-size: 18px;
            color: #5d4e37;
            font-family: 'Noto Serif SC', serif;
          }

          p {
            margin: 0;
            font-size: 14px;
            color: #9b8f7a;
          }
        }

        .annotations-list {
          &.list-view {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          &.card-view {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
            gap: 16px;
          }
        }

        .pagination {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 24px;
          padding: 24px 20px;
          margin-top: 20px;
          border-top: 1px solid #e5dccb;

          .page-info {
            color: #6b5d4a;
            font-size: 13px;
          }
        }
      }
    }

    .create-dialog-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(44, 36, 22, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;

      .create-dialog {
        width: 90%;
        max-width: 700px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;

        .dialog-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 16px;
          margin-bottom: 16px;
          border-bottom: 2px solid #c84c3b;

          h2 {
            margin: 0;
            font-size: 20px;
            font-weight: 600;
            color: #5d4e37;
            font-family: 'Noto Serif SC', serif;
          }
        }

        .dialog-content {
          flex: 1;
          overflow-y: auto;
        }
      }
    }

    .spinning {
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
  `]
})
export class AnnotationPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly annotationService = inject(AnnotationService);
  readonly realtimeService = inject(RealtimeAnnotationService);
  private readonly destroy$ = new Subject<void>();

  readonly projectId = computed(() => this.route.snapshot.paramMap.get('projectId'));
  readonly documentId = computed(() => this.route.snapshot.paramMap.get('documentId'));

  readonly isLoading = signal(false);
  readonly showCreateDialog = signal(false);
  readonly showPanel = signal(false);
  readonly viewMode = signal<'list' | 'card'>('list');
  readonly activeTabIndex = signal(0);

  readonly annotations = signal<Annotation[]>([]);
  readonly currentSelection = signal<TextSelection | null>(null);
  readonly stats = signal<AnnotationStats | null>(null);
  readonly notifications = signal<AnnotationNotification[]>([]);
  readonly readAnnotationIds = signal<string[]>([]);

  readonly currentPage = signal(1);
  readonly pageSize = signal(20);
  readonly totalCount = signal(0);
  readonly totalPages = computed(() => Math.ceil(this.totalCount() / this.pageSize()));

  readonly searchControl = new FormControl('');
  readonly authorFilter = new FormControl<string | null>(null);
  readonly assigneeFilter = new FormControl<string | null>(null);
  readonly tagFilter = new FormControl('');
  readonly startDateFilter = new FormControl<Date | null>(null);
  readonly endDateFilter = new FormControl<Date | null>(null);
  readonly sortControl = new FormControl('createdAt-desc');

  readonly statusFilter = signal<AnnotationStatus[]>([]);
  readonly priorityFilter = signal<AnnotationPriority[]>([]);

  readonly statusOptions = [
    { value: AnnotationStatus.OPEN, label: '打开' },
    { value: AnnotationStatus.RESOLVED, label: '已解决' },
    { value: AnnotationStatus.CLOSED, label: '已关闭' }
  ];

  readonly priorityOptions = [
    { value: AnnotationPriority.LOW, label: '低' },
    { value: AnnotationPriority.MEDIUM, label: '中' },
    { value: AnnotationPriority.HIGH, label: '高' },
    { value: AnnotationPriority.URGENT, label: '紧急' }
  ];

  readonly unreadCount = computed(() =>
    this.notifications().filter(n => !n.isRead).length
  );

  readonly AnnotationStatus = AnnotationStatus;
  readonly AnnotationPriority = AnnotationPriority;

  ngOnInit(): void {
    this.loadStats();
    this.loadNotifications();
    this.setupSearch();
    this.setupRealtimeListeners();
    this.loadAnnotations();

    const pid = this.projectId();
    if (pid) {
      this.realtimeService.connect();
      this.realtimeService.joinProject(pid);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.realtimeService.leaveAllRooms();
  }

  private setupSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadAnnotations();
      });

    this.sortControl.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadAnnotations();
      });
  }

  private setupRealtimeListeners(): void {
    this.realtimeService
      .onAnnotationCreated()
      .pipe(takeUntil(this.destroy$))
      .subscribe((annotation) => {
        this.annotations.update(prev => [annotation, ...prev]);
        this.loadStats();
      });

    this.realtimeService
      .onAnnotationUpdated()
      .pipe(takeUntil(this.destroy$))
      .subscribe((annotation) => {
        this.annotations.update(prev =>
          prev.map(a => a.id === annotation.id ? annotation : a)
        );
        this.loadStats();
      });

    this.realtimeService
      .onAnnotationDeleted()
      .pipe(takeUntil(this.destroy$))
      .subscribe((annotationId) => {
        this.annotations.update(prev => prev.filter(a => a.id !== annotationId));
        this.loadStats();
      });

    this.realtimeService
      .onNotification()
      .pipe(takeUntil(this.destroy$))
      .subscribe((notification) => {
        this.notifications.update(prev => [notification, ...prev]);
      });
  }

  private loadStats(): void {
    this.annotationService
      .getStats(this.projectId() || undefined, this.documentId() || undefined)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (stats) => {
          this.stats.set(stats);
        }
      });
  }

  private loadNotifications(): void {
    this.annotationService
      .getNotifications(1, 10, true)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.notifications.set(response.items);
        }
      });
  }

  private loadAnnotations(): void {
    this.isLoading.set(true);

    const filter = this.buildFilter();

    this.annotationService
      .getAnnotations(filter)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.annotations.set(response.items);
          this.totalCount.set(response.total);
          this.currentPage.set(response.page);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  private buildFilter(): AnnotationFilter {
    const [sortBy, sortOrder] = (this.sortControl.value || 'createdAt-desc').split('-');

    return {
      projectId: this.projectId() || undefined,
      documentId: this.documentId() || undefined,
      searchText: this.searchControl.value || undefined,
      status: this.statusFilter().length > 0 ? this.statusFilter() : undefined,
      priority: this.priorityFilter().length > 0 ? this.priorityFilter() : undefined,
      authorId: this.authorFilter.value === 'me' ? 'current' :
                this.authorFilter.value === 'others' ? 'others' : undefined,
      assigneeId: this.assigneeFilter.value === 'me' ? 'current' :
                  this.assigneeFilter.value === 'others' ? 'others' : undefined,
      tags: this.tagFilter.value ? [this.tagFilter.value] : undefined,
      startDate: this.startDateFilter.value || undefined,
      endDate: this.endDateFilter.value || undefined,
      page: this.currentPage(),
      pageSize: this.pageSize(),
      sortBy: sortBy as any,
      sortOrder: sortOrder as 'asc' | 'desc'
    };
  }

  isStatusSelected(status: AnnotationStatus): boolean {
    return this.statusFilter().includes(status);
  }

  toggleStatusFilter(status: AnnotationStatus): void {
    this.statusFilter.update(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  }

  isPrioritySelected(priority: AnnotationPriority): boolean {
    return this.priorityFilter().includes(priority);
  }

  togglePriorityFilter(priority: AnnotationPriority): void {
    this.priorityFilter.update(prev =>
      prev.includes(priority)
        ? prev.filter(p => p !== priority)
        : [...prev, priority]
    );
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadAnnotations();
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.authorFilter.setValue(null);
    this.assigneeFilter.setValue(null);
    this.tagFilter.setValue('');
    this.startDateFilter.setValue(null);
    this.endDateFilter.setValue(null);
    this.statusFilter.set([]);
    this.priorityFilter.set([]);
    this.sortControl.setValue('createdAt-desc');
    this.currentPage.set(1);
    this.loadAnnotations();
  }

  onTabChange(event: any): void {
    this.activeTabIndex.set(event.index);

    switch (event.index) {
      case 0:
        this.statusFilter.set([]);
        break;
      case 1:
        this.statusFilter.set([AnnotationStatus.OPEN]);
        break;
      case 2:
        this.statusFilter.set([AnnotationStatus.RESOLVED]);
        break;
      case 3:
        this.statusFilter.set([AnnotationStatus.CLOSED]);
        break;
      case 4:
        this.assigneeFilter.setValue('me');
        break;
    }

    this.currentPage.set(1);
    this.loadAnnotations();
  }

  setViewMode(mode: 'list' | 'card'): void {
    this.viewMode.set(mode);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  refreshAnnotations(): void {
    this.loadAnnotations();
    this.loadStats();
    this.loadNotifications();
  }

  openCreateDialog(): void {
    this.showCreateDialog.set(true);
  }

  closeCreateDialog(): void {
    this.showCreateDialog.set(false);
  }

  reconnect(): void {
    this.realtimeService.connect();
  }

  markAllNotificationsRead(): void {
    this.annotationService
      .markNotificationsRead({ all: true })
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.notifications.update(prev =>
            prev.map(n => ({ ...n, isRead: true }))
          );
        }
      });
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
      this.loadAnnotations();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      this.loadAnnotations();
    }
  }

  isAnnotationRead(annotation: Annotation): boolean {
    return this.readAnnotationIds().includes(annotation.id);
  }

  onNavigateToSelection(selection: TextSelection): void {
    console.log('Navigate to selection:', selection);
  }

  onAnnotationCreated(annotation: Annotation): void {
    this.annotations.update(prev => [annotation, ...prev]);
    this.showCreateDialog.set(false);
    this.showPanel.set(false);
    this.loadStats();
  }

  onAnnotationUpdated(annotation: Annotation): void {
    this.annotations.update(prev =>
      prev.map(a => a.id === annotation.id ? annotation : a)
    );
    this.loadStats();
  }

  onAnnotationDeleted(annotationId: string): void {
    this.annotations.update(prev => prev.filter(a => a.id !== annotationId));
    this.loadStats();
  }

  getNotificationIcon(type: string): string {
    const iconMap: Record<string, string> = {
      NEW_ANNOTATION: 'comment',
      NEW_REPLY: 'reply',
      MENTIONED: 'alternate_email',
      STATUS_CHANGED: 'sync_alt',
      ASSIGNED: 'assignment_ind',
      RESOLVED: 'check_circle'
    };
    return iconMap[type] || 'notifications';
  }

  getNotificationTitle(notification: AnnotationNotification): string {
    const userName = notification.triggeredBy?.nickname || notification.triggeredBy?.username || '某人';
    const titleMap: Record<string, string> = {
      NEW_ANNOTATION: `${userName} 创建了新批注`,
      NEW_REPLY: `${userName} 回复了批注`,
      MENTIONED: `${userName} 在批注中@了你`,
      STATUS_CHANGED: `${userName} 更新了批注状态`,
      ASSIGNED: `${userName} 将批注指派给了你`,
      RESOLVED: `${userName} 解决了批注`
    };
    return titleMap[notification.type] || '有新的批注动态';
  }
}

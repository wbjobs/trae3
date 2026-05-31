// 文件管理页面组件

import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  signal,
  computed,
  inject
} from '@angular/core';
import { map } from 'rxjs';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormControl,
  FormsModule,
  ReactiveFormsModule
} from '@angular/forms';
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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { FileService } from '../../services/file.service';
import { FileUploadComponent } from '../../components/file-upload/file-upload.component';
import {
  FileInfo,
  FileStatus,
  FileType,
  FileAccess,
  FileFilter,
  FilePageResponse
} from '../../../../core/models/file.model';

@Component({
  selector: 'app-file-manager-page',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    ReactiveFormsModule,
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
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatPaginatorModule,
    MatDialogModule,
    FileUploadComponent
  ],
  template: `
    <div class="file-manager-page">
      <mat-toolbar class="page-toolbar">
        <div class="toolbar-left">
          <button mat-icon-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1 class="page-title">
            <mat-icon class="title-icon">folder</mat-icon>
            文件管理
          </h1>
        </div>

        <div class="toolbar-center">
          <mat-form-field appearance="outline" class="search-input">
            <mat-label>搜索文件</mat-label>
            <input
              matInput
              [formControl]="searchControl"
              placeholder="输入文件名或标签搜索..."
            />
            <mat-icon matPrefix>search</mat-icon>
            <button
              mat-icon-button
              matSuffix
              *ngIf="searchControl.value"
              (click)="clearSearch()"
            >
              <mat-icon>close</mat-icon>
            </button>
          </mat-form-field>
        </div>

        <div class="toolbar-right">
          <button
            mat-button
            [matMenuTriggerFor]="uploadMenu"
            class="upload-button"
          >
            <mat-icon>upload</mat-icon>
            上传文件
          </button>

          <mat-menu #uploadMenu="matMenu">
            <button mat-menu-item (click)="showUploadPanel.set(true)">
              <mat-icon>cloud_upload</mat-icon>
              拖拽上传
            </button>
            <button mat-menu-item (click)="triggerFileInput()">
              <mat-icon>file_upload</mat-icon>
              选择文件
            </button>
          </mat-menu>

          <button
            mat-icon-button
            (click)="toggleFilters()"
            [class.active]="showFilters()"
            matTooltip="筛选器"
          >
            <mat-icon>filter_alt</mat-icon>
          </button>

          <button
            mat-icon-button
            [matMenuTriggerFor]="viewMenu"
            matTooltip="视图"
          >
            <mat-icon>{{ viewMode() === 'list' ? 'list' : 'grid_view' }}</mat-icon>
          </button>

          <mat-menu #viewMenu="matMenu">
            <button
              mat-menu-item
              (click)="setViewMode('list')"
              [class.active]="viewMode() === 'list'"
            >
              <mat-icon>list</mat-icon>
              列表视图
            </button>
            <button
              mat-menu-item
              (click)="setViewMode('grid')"
              [class.active]="viewMode() === 'grid'"
            >
              <mat-icon>grid_view</mat-icon>
              网格视图
            </button>
          </mat-menu>

          <button
            mat-icon-button
            [matMenuTriggerFor]="moreMenu"
            matTooltip="更多"
          >
            <mat-icon>more_vert</mat-icon>
          </button>

          <mat-menu #moreMenu="matMenu">
            <button
              mat-menu-item
              (click)="batchDelete()"
              [disabled]="selectedFiles().length === 0"
            >
              <mat-icon>delete</mat-icon>
              批量删除
            </button>
            <button
              mat-menu-item
              (click)="batchDownload()"
              [disabled]="selectedFiles().length === 0"
            >
              <mat-icon>download</mat-icon>
              批量下载
            </button>
          </mat-menu>
        </div>
      </mat-toolbar>

      <div class="page-content">
        <mat-sidenav-container class="content-container">
          <mat-sidenav
            #filterSidenav
            mode="side"
            [opened]="showFilters()"
            class="filter-sidenav"
          >
            <div class="filter-panel">
              <div class="filter-header">
                <h3>筛选条件</h3>
                <button mat-icon-button (click)="toggleFilters()">
                  <mat-icon>close</mat-icon>
                </button>
              </div>

              <div class="filter-section">
                <h4>文件类型</h4>
                <div class="filter-options">
                  <mat-checkbox
                    *ngFor="let type of fileTypeOptions"
                    [checked]="isTypeSelected(type.value)"
                    (change)="toggleType(type.value)"
                  >
                    <mat-icon class="option-icon">{{ type.icon }}</mat-icon>
                    {{ type.label }}
                  </mat-checkbox>
                </div>
              </div>

              <div class="filter-section">
                <h4>文件状态</h4>
                <div class="filter-options">
                  <mat-checkbox
                    *ngFor="let status of fileStatusOptions"
                    [checked]="isStatusSelected(status.value)"
                    (change)="toggleStatus(status.value)"
                  >
                    <span class="status-dot" [style.background]="status.color"></span>
                    {{ status.label }}
                  </mat-checkbox>
                </div>
              </div>

              <div class="filter-section">
                <h4>访问权限</h4>
                <div class="filter-options">
                  <mat-checkbox
                    *ngFor="let access of fileAccessOptions"
                    [checked]="isAccessSelected(access.value)"
                    (change)="toggleAccess(access.value)"
                  >
                    <mat-icon class="option-icon">{{ access.icon }}</mat-icon>
                    {{ access.label }}
                  </mat-checkbox>
                </div>
              </div>

              <div class="filter-section">
                <h4>文件大小</h4>
                <div class="size-options">
                  <mat-form-field appearance="outline" class="size-input">
                    <mat-label>最小 (MB)</mat-label>
                    <input matInput type="number" [formControl]="minSizeControl" min="0" />
                  </mat-form-field>
                  <span class="size-separator">-</span>
                  <mat-form-field appearance="outline" class="size-input">
                    <mat-label>最大 (MB)</mat-label>
                    <input matInput type="number" [formControl]="maxSizeControl" min="0" />
                  </mat-form-field>
                </div>
              </div>

              <div class="filter-section">
                <h4>上传日期</h4>
                <div class="date-range">
                  <mat-form-field appearance="outline" class="date-input">
                    <mat-label>开始日期</mat-label>
                    <input matInput type="date" [formControl]="startDateControl" />
                  </mat-form-field>
                  <span class="date-separator">-</span>
                  <mat-form-field appearance="outline" class="date-input">
                    <mat-label>结束日期</mat-label>
                    <input matInput type="date" [formControl]="endDateControl" />
                  </mat-form-field>
                </div>
              </div>

              <div class="filter-section">
                <h4>排序方式</h4>
                <mat-form-field appearance="outline" class="sort-select">
                  <mat-select [formControl]="sortControl">
                    <mat-option value="createdAt-desc">最新上传</mat-option>
                    <mat-option value="createdAt-asc">最早上传</mat-option>
                    <mat-option value="updatedAt-desc">最新更新</mat-option>
                    <mat-option value="updatedAt-asc">最早更新</mat-option>
                    <mat-option value="size-desc">最大文件</mat-option>
                    <mat-option value="size-asc">最小文件</mat-option>
                    <mat-option value="name-asc">名称 A-Z</mat-option>
                    <mat-option value="name-desc">名称 Z-A</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="filter-actions">
                <button mat-button (click)="clearFilters()">
                  <mat-icon>filter_alt_off</mat-icon>
                  重置
                </button>
                <button mat-raised-button color="primary" (click)="applyFilters()">
                  <mat-icon>check</mat-icon>
                  应用
                </button>
              </div>
            </div>
          </mat-sidenav>

          <mat-sidenav-content>
            <div class="content-main">
              <div class="upload-panel" *ngIf="showUploadPanel()">
                <div class="panel-header">
                  <h3>上传文件</h3>
                  <button mat-icon-button (click)="showUploadPanel.set(false)">
                    <mat-icon>close</mat-icon>
                  </button>
                </div>
                <app-file-upload
                  [projects]="projects()"
                  (uploadComplete)="onUploadComplete()"
                  (uploadError)="onUploadError($event)"
                ></app-file-upload>
              </div>

              <div class="stats-bar">
                <div class="stat-item">
                  <span class="stat-value">{{ fileResponse()?.total || 0 }}</span>
                  <span class="stat-label">总文件数</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{{ formatTotalSize() }}</span>
                  <span class="stat-label">总大小</span>
                </div>
                <div class="stat-item">
                  <span class="stat-value">{{ selectedFiles().length }}</span>
                  <span class="stat-label">已选择</span>
                </div>
                <div class="stat-item" *ngIf="uploadingCount() > 0">
                  <mat-spinner diameter="16"></mat-spinner>
                  <span class="stat-label">{{ uploadingCount() }} 个上传中</span>
                </div>
              </div>

              <div class="files-toolbar" *ngIf="fileResponse()?.items && fileResponse()!.items.length > 0">
                <div class="select-all">
                  <mat-checkbox
                    [checked]="isAllSelected()"
                    [indeterminate]="isIndeterminate()"
                    (change)="toggleSelectAll()"
                  >
                    全选
                  </mat-checkbox>
                </div>

                <div class="toolbar-actions">
                  <button
                    mat-button
                    *ngIf="selectedFiles().length > 0"
                    (click)="clearSelection()"
                  >
                    取消选择
                  </button>
                </div>
              </div>

              <div class="loading-overlay" *ngIf="isLoading()">
                <mat-spinner diameter="48"></mat-spinner>
                <span>加载中...</span>
              </div>

              <div class="empty-state" *ngIf="!isLoading() && fileResponse()?.total === 0">
                <mat-icon class="empty-icon">folder_open</mat-icon>
                <h3>暂无文件</h3>
                <p>点击"上传文件"按钮开始上传您的古籍资料</p>
                <button mat-raised-button color="primary" (click)="showUploadPanel.set(true)">
                  <mat-icon>upload</mat-icon>
                  立即上传
                </button>
              </div>

              <div
                class="files-container"
                *ngIf="!isLoading() && fileResponse()?.items && fileResponse()!.items.length > 0"
                [class.list-view]="viewMode() === 'list'"
                [class.grid-view]="viewMode() === 'grid'"
              >
                <div
                  *ngFor="let file of fileResponse()!.items"
                  class="file-item ancient-card"
                  [class.selected]="isFileSelected(file.id)"
                  (click)="toggleFileSelection(file.id)"
                >
                  <div class="file-checkbox" (click)="$event.stopPropagation()">
                    <mat-checkbox
                      [checked]="isFileSelected(file.id)"
                      (change)="toggleFileSelection(file.id)"
                    ></mat-checkbox>
                  </div>

                  <div class="file-preview">
                    <ng-container *ngIf="file.thumbnailUrl && file.type === FileType.IMAGE">
                      <img [src]="file.thumbnailUrl" [alt]="file.name" loading="lazy" />
                    </ng-container>
                    <ng-container *ngIf="!file.thumbnailUrl || file.type !== FileType.IMAGE">
                      <mat-icon class="file-type-icon">{{ getFileIcon(file.type) }}</mat-icon>
                    </ng-container>

                    <span
                      class="status-indicator"
                      [style.background]="getStatusColor(file.status)"
                      [matTooltip]="getStatusText(file.status)"
                    ></span>
                  </div>

                  <div class="file-info">
                    <h4 class="file-name" [title]="file.name">{{ file.name }}</h4>
                    <div class="file-meta">
                      <span class="file-size">{{ formatFileSize(file.size) }}</span>
                      <span class="file-date">{{ file.createdAt | date: 'yyyy-MM-dd HH:mm' }}</span>
                    </div>
                    <div class="file-tags" *ngIf="file.tags && file.tags.length > 0">
                      <mat-chip *ngFor="let tag of file.tags" class="tag-chip">
                        {{ tag }}
                      </mat-chip>
                    </div>
                  </div>

                  <div class="file-actions" (click)="$event.stopPropagation()">
                    <button
                      mat-icon-button
                      *ngIf="file.status === FileStatus.COMPLETED"
                      (click)="previewFile(file)"
                      matTooltip="预览"
                    >
                      <mat-icon>visibility</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      *ngIf="file.status === FileStatus.COMPLETED"
                      (click)="downloadFile(file)"
                      matTooltip="下载"
                    >
                      <mat-icon>download</mat-icon>
                    </button>
                    <button
                      mat-icon-button
                      [matMenuTriggerFor]="fileMenu"
                      matTooltip="更多"
                    >
                      <mat-icon>more_vert</mat-icon>
                    </button>

                    <mat-menu #fileMenu="matMenu">
                      <button
                        mat-menu-item
                        (click)="shareFile(file)"
                        [disabled]="file.status !== FileStatus.COMPLETED"
                      >
                        <mat-icon>share</mat-icon>
                        分享
                      </button>
                      <button
                        mat-menu-item
                        (click)="renameFile(file)"
                      >
                        <mat-icon>edit</mat-icon>
                        重命名
                      </button>
                      <button
                        mat-menu-item
                        (click)="moveFile(file)"
                      >
                        <mat-icon>drive_file_move</mat-icon>
                        移动
                      </button>
                      <button
                        mat-menu-item
                        (click)="copyFile(file)"
                      >
                        <mat-icon>file_copy</mat-icon>
                        复制
                      </button>
                      <mat-divider></mat-divider>
                      <button
                        mat-menu-item
                        class="danger"
                        (click)="deleteFile(file)"
                      >
                        <mat-icon>delete</mat-icon>
                        删除
                      </button>
                    </mat-menu>
                  </div>
                </div>
              </div>

              <mat-paginator
                *ngIf="fileResponse() && fileResponse()!.total > pageSize()"
                [length]="fileResponse()!.total"
                [pageSize]="pageSize()"
                [pageSizeOptions]="[10, 20, 50, 100]"
                [pageIndex]="currentPage() - 1"
                (page)="onPageChange($event)"
                class="file-paginator"
              ></mat-paginator>
            </div>
          </mat-sidenav-content>
        </mat-sidenav-container>
      </div>

      <input
        #fileInput
        type="file"
        [multiple]="true"
        (change)="onFileInputChange($event)"
        hidden
      />
    </div>
  `,
  styles: [`
    .file-manager-page {
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
      height: 72px;
      gap: 16px;

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
        max-width: 500px;

        .search-input {
          width: 100%;
          margin-bottom: -1.25em;
        }
      }

      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 8px;

        .upload-button {
          background: #c84c3b;
          color: #fff;

          &:hover {
            background: #b53d2e;
          }
        }

        button.active {
          background: rgba(200, 76, 59, 0.1);
          color: #c84c3b;
        }
      }
    }

    .page-content {
      flex: 1;
      overflow: hidden;
    }

    .content-container {
      height: 100%;
    }

    .filter-sidenav {
      width: 300px;
      background: #faf7f0;
      border-right: 1px solid #d4c9b5;

      .filter-panel {
        padding: 20px;
        height: 100%;
        overflow-y: auto;

        .filter-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
          padding-bottom: 12px;
          border-bottom: 2px solid #c84c3b;

          h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #5d4e37;
            font-family: 'Noto Serif SC', serif;
          }
        }

        .filter-section {
          margin-bottom: 24px;

          h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #5d4e37;
          }

          .filter-options {
            display: flex;
            flex-direction: column;
            gap: 8px;

            .option-icon {
              font-size: 18px;
              width: 18px;
              height: 18px;
              margin-right: 8px;
              color: #8b7d65;
            }

            .status-dot {
              width: 10px;
              height: 10px;
              border-radius: 50%;
              margin-right: 8px;
              display: inline-block;
            }
          }

          .size-options {
            display: flex;
            align-items: center;
            gap: 8px;

            .size-input {
              flex: 1;

              input {
                -moz-appearance: textfield;

                &::-webkit-outer-spin-button,
                &::-webkit-inner-spin-button {
                  -webkit-appearance: none;
                  margin: 0;
                }
              }
            }

            .size-separator {
              color: #9b8f7a;
            }
          }

          .date-range {
            display: flex;
            align-items: center;
            gap: 8px;

            .date-input {
              flex: 1;
            }

            .date-separator {
              color: #9b8f7a;
            }
          }

          .sort-select {
            width: 100%;
          }
        }

        .filter-actions {
          display: flex;
          gap: 8px;
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #e5dccb;

          button {
            flex: 1;
            justify-content: center;
          }
        }
      }
    }

    .content-main {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      position: relative;

      .upload-panel {
        margin-bottom: 20px;
        padding: 20px;
        background: #fff;
        border-radius: 8px;
        border: 1px solid #e5dccb;

        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;

          h3 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #5d4e37;
            font-family: 'Noto Serif SC', serif;
          }
        }
      }

      .stats-bar {
        display: flex;
        gap: 32px;
        padding: 16px 20px;
        margin-bottom: 20px;
        background: #fff;
        border-radius: 8px;
        border: 1px solid #e5dccb;

        .stat-item {
          display: flex;
          align-items: center;
          gap: 8px;

          .stat-value {
            font-size: 20px;
            font-weight: 600;
            color: #c84c3b;
          }

          .stat-label {
            font-size: 14px;
            color: #6b5d4a;
          }
        }
      }

      .files-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;

        .select-all {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      }

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
      }

      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px 20px;
        text-align: center;

        .empty-icon {
          font-size: 80px;
          width: 80px;
          height: 80px;
          color: #d4c9b5;
          margin-bottom: 20px;
        }

        h3 {
          margin: 0 0 8px 0;
          font-size: 20px;
          color: #5d4e37;
          font-family: 'Noto Serif SC', serif;
        }

        p {
          margin: 0 0 24px 0;
          font-size: 14px;
          color: #9b8f7a;
        }
      }

      .files-container {
        &.list-view {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        &.grid-view {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }

        .file-item {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 16px;
          cursor: pointer;
          transition: all 0.2s;

          &:hover {
            border-color: #c84c3b;
            background: #fff9f5;
          }

          &.selected {
            border-color: #c84c3b;
            background: #fff0ed;
          }

          .file-checkbox {
            flex-shrink: 0;
          }

          .file-preview {
            position: relative;
            width: 80px;
            height: 80px;
            flex-shrink: 0;
            border-radius: 4px;
            overflow: hidden;
            background: #f5f0e6;
            display: flex;
            align-items: center;
            justify-content: center;

            img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }

            .file-type-icon {
              font-size: 40px;
              width: 40px;
              height: 40px;
              color: #8b7d65;
            }

            .status-indicator {
              position: absolute;
              top: 4px;
              right: 4px;
              width: 12px;
              height: 12px;
              border-radius: 50%;
              border: 2px solid #fff;
            }
          }

          .file-info {
            flex: 1;
            min-width: 0;

            .file-name {
              margin: 0 0 8px 0;
              font-size: 15px;
              font-weight: 500;
              color: #2c2416;
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }

            .file-meta {
              display: flex;
              gap: 16px;
              font-size: 12px;
              color: #9b8f7a;
              margin-bottom: 8px;
            }

            .file-tags {
              display: flex;
              flex-wrap: wrap;
              gap: 4px;

              .tag-chip {
                font-size: 11px;
                padding: 0 8px;
                height: 20px;
                background: #f5f0e6;
              }
            }
          }

          .file-actions {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
          }
        }
      }

      .file-paginator {
        margin-top: 20px;
        background: #fff;
        border-radius: 8px;
        border: 1px solid #e5dccb;
      }
    }

    .danger {
      color: #f44336 !important;
    }
  `]
})
export class FileManagerPageComponent implements OnInit, OnDestroy {
  private readonly fileService = inject(FileService);
  private readonly dialog = inject(MatDialog);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  readonly FileType = FileType;
  readonly FileStatus = FileStatus;

  readonly searchControl = new FormControl('');
  readonly minSizeControl = new FormControl<number | null>(null);
  readonly maxSizeControl = new FormControl<number | null>(null);
  readonly startDateControl = new FormControl<Date | null>(null);
  readonly endDateControl = new FormControl<Date | null>(null);
  readonly sortControl = new FormControl('createdAt-desc');

  readonly isLoading = signal(false);
  readonly showFilters = signal(true);
  readonly showUploadPanel = signal(false);
  readonly viewMode = signal<'list' | 'grid'>('list');

  readonly selectedTypes = signal<FileType[]>([]);
  readonly selectedStatuses = signal<FileStatus[]>([]);
  readonly selectedAccess = signal<FileAccess[]>([]);
  readonly selectedFiles = signal<string[]>([]);

  readonly fileResponse = signal<FilePageResponse | null>(null);
  readonly projects = signal<{ id: string; name: string }[]>([
    { id: 'proj-001', name: '古籍数字化项目一期' },
    { id: 'proj-002', name: '善本整理工程' }
  ]);

  readonly currentPage = signal(1);
  readonly pageSize = signal(20);

  readonly uploadingCount = signal(0);
  private uploadingCountSub?: Subscription;

  readonly fileTypeOptions = [
    { value: FileType.IMAGE, label: '图片', icon: 'image' },
    { value: FileType.PDF, label: 'PDF', icon: 'picture_as_pdf' },
    { value: FileType.DOCUMENT, label: '文档', icon: 'description' },
    { value: FileType.ARCHIVE, label: '压缩包', icon: 'folder_zip' },
    { value: FileType.AUDIO, label: '音频', icon: 'audio_file' },
    { value: FileType.VIDEO, label: '视频', icon: 'videocam' }
  ];

  readonly fileStatusOptions = [
    { value: FileStatus.READY, label: '就绪', color: '#4CAF50' },
    { value: FileStatus.UPLOADING, label: '上传中', color: '#2196F3' },
    { value: FileStatus.PAUSED, label: '已暂停', color: '#FF9800' },
    { value: FileStatus.PROCESSING, label: '处理中', color: '#9C27B0' },
    { value: FileStatus.COMPLETED, label: '已完成', color: '#4CAF50' },
    { value: FileStatus.FAILED, label: '失败', color: '#F44336' }
  ];

  readonly fileAccessOptions = [
    { value: FileAccess.PRIVATE, label: '私有', icon: 'lock' },
    { value: FileAccess.PROJECT, label: '项目可见', icon: 'group' },
    { value: FileAccess.PUBLIC, label: '公开', icon: 'public' }
  ];

  ngOnInit(): void {
    this.setupSearch();
    this.loadFiles();

    this.fileService.progress$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadFiles();
      });

    this.uploadingCountSub = this.fileService.activeUploads$
      .pipe(
        map(map => map.size),
        takeUntil(this.destroy$)
      )
      .subscribe(count => {
        this.uploadingCount.set(count);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch(): void {
    this.searchControl.valueChanges
      .pipe(
        debounceTime(300),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.currentPage.set(1);
        this.loadFiles();
      });
  }

  loadFiles(): void {
    this.isLoading.set(true);

    const [sortBy, sortOrder] = (this.sortControl.value || 'createdAt-desc').split('-');

    const filter: FileFilter = {
      page: this.currentPage(),
      pageSize: this.pageSize(),
      sortBy: sortBy as any,
      sortOrder: sortOrder as 'asc' | 'desc'
    };

    if (this.searchControl.value) {
      filter.searchText = this.searchControl.value;
    }

    if (this.selectedTypes().length > 0) {
      filter.type = this.selectedTypes();
    }

    if (this.selectedStatuses().length > 0) {
      filter.status = this.selectedStatuses();
    }

    if (this.selectedAccess().length > 0) {
      filter.access = this.selectedAccess();
    }

    if (this.minSizeControl.value) {
      filter.minSize = this.minSizeControl.value * 1024 * 1024;
    }

    if (this.maxSizeControl.value) {
      filter.maxSize = this.maxSizeControl.value * 1024 * 1024;
    }

    if (this.startDateControl.value) {
      filter.startDate = this.startDateControl.value;
    }

    if (this.endDateControl.value) {
      filter.endDate = this.endDateControl.value;
    }

    this.fileService.getFiles(filter)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.fileResponse.set(response);
          this.isLoading.set(false);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  isTypeSelected(type: FileType): boolean {
    return this.selectedTypes().includes(type);
  }

  toggleType(type: FileType): void {
    this.selectedTypes.update(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  }

  isStatusSelected(status: FileStatus): boolean {
    return this.selectedStatuses().includes(status);
  }

  toggleStatus(status: FileStatus): void {
    this.selectedStatuses.update(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  }

  isAccessSelected(access: FileAccess): boolean {
    return this.selectedAccess().includes(access);
  }

  toggleAccess(access: FileAccess): void {
    this.selectedAccess.update(prev =>
      prev.includes(access)
        ? prev.filter(a => a !== access)
        : [...prev, access]
    );
  }

  applyFilters(): void {
    this.currentPage.set(1);
    this.loadFiles();
  }

  clearFilters(): void {
    this.searchControl.setValue('');
    this.selectedTypes.set([]);
    this.selectedStatuses.set([]);
    this.selectedAccess.set([]);
    this.minSizeControl.setValue(null);
    this.maxSizeControl.setValue(null);
    this.startDateControl.setValue(null);
    this.endDateControl.setValue(null);
    this.sortControl.setValue('createdAt-desc');
    this.currentPage.set(1);
    this.loadFiles();
  }

  toggleFilters(): void {
    this.showFilters.update(v => !v);
  }

  setViewMode(mode: 'list' | 'grid'): void {
    this.viewMode.set(mode);
  }

  onPageChange(event: PageEvent): void {
    this.currentPage.set(event.pageIndex + 1);
    this.pageSize.set(event.pageSize);
    this.loadFiles();
  }

  clearSearch(): void {
    this.searchControl.setValue('');
  }

  triggerFileInput(): void {
    this.fileInput.nativeElement.click();
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.showUploadPanel.set(true);
    }
    input.value = '';
  }

  isFileSelected(fileId: string): boolean {
    return this.selectedFiles().includes(fileId);
  }

  toggleFileSelection(fileId: string): void {
    this.selectedFiles.update(prev =>
      prev.includes(fileId)
        ? prev.filter(id => id !== fileId)
        : [...prev, fileId]
    );
  }

  isAllSelected(): boolean {
    const items = this.fileResponse()?.items || [];
    return items.length > 0 && items.every(item => this.selectedFiles().includes(item.id));
  }

  isIndeterminate(): boolean {
    const items = this.fileResponse()?.items || [];
    const selectedCount = items.filter(item => this.selectedFiles().includes(item.id)).length;
    return selectedCount > 0 && selectedCount < items.length;
  }

  toggleSelectAll(): void {
    const items = this.fileResponse()?.items || [];
    if (this.isAllSelected()) {
      this.selectedFiles.set([]);
    } else {
      this.selectedFiles.set(items.map(item => item.id));
    }
  }

  clearSelection(): void {
    this.selectedFiles.set([]);
  }

  onUploadComplete(): void {
    this.loadFiles();
  }

  onUploadError(error: Error): void {
    console.error('Upload error:', error);
  }

  formatTotalSize(): string {
    const response = this.fileResponse();
    if (!response) return '0 B';
    return this.fileService.formatFileSize(response.totalSize);
  }

  formatFileSize(bytes: number): string {
    return this.fileService.formatFileSize(bytes);
  }

  getFileIcon(type: FileType): string {
    return this.fileService.getFileIcon(type);
  }

  getStatusColor(status: FileStatus): string {
    return this.fileService.getStatusColor(status);
  }

  getStatusText(status: FileStatus): string {
    return this.fileService.getStatusText(status);
  }

  previewFile(file: FileInfo): void {
    console.log('Preview file:', file.name);
  }

  downloadFile(file: FileInfo): void {
    this.fileService.downloadFile(file.id).subscribe();
  }

  shareFile(file: FileInfo): void {
    console.log('Share file:', file.name);
  }

  renameFile(file: FileInfo): void {
    console.log('Rename file:', file.name);
  }

  moveFile(file: FileInfo): void {
    console.log('Move file:', file.name);
  }

  copyFile(file: FileInfo): void {
    console.log('Copy file:', file.name);
  }

  deleteFile(file: FileInfo): void {
    if (confirm(`确定要删除文件 "${file.name}" 吗？`)) {
      this.fileService.deleteFile(file.id).subscribe({
        next: () => {
          this.loadFiles();
          this.selectedFiles.update(prev => prev.filter(id => id !== file.id));
        }
      });
    }
  }

  batchDelete(): void {
    if (this.selectedFiles().length === 0) return;
    if (confirm(`确定要删除选中的 ${this.selectedFiles().length} 个文件吗？`)) {
      this.fileService.batchOperation({
        fileIds: this.selectedFiles(),
        action: 'delete'
      }).subscribe({
        next: () => {
          this.loadFiles();
          this.selectedFiles.set([]);
        }
      });
    }
  }

  batchDownload(): void {
    if (this.selectedFiles().length === 0) return;
    this.fileService.batchOperation({
      fileIds: this.selectedFiles(),
      action: 'download'
    }).subscribe();
  }

  goBack(): void {
    window.history.back();
  }
}

// 文件上传组件 - 大文件分片上传组件

import {
  Component,
  OnInit,
  OnDestroy,
  Input,
  Output,
  EventEmitter,
  ViewChild,
  ElementRef,
  signal,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, FormControl, ReactiveFormsModule } from '@angular/forms';
import { Subject, takeUntil, Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { FileService } from '../../services/file.service';
import {
  UploadProgress,
  FileStatus,
  FileAccess,
  DropzoneConfig,
  FileInfo
} from '../../../../core/models/file.model';

@Component({
  selector: 'app-file-upload',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatProgressBarModule,
    MatTooltipModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule
  ],
  template: `
    <div class="file-upload-component">
      <div
        class="upload-area"
        [class.drag-over]="isDragOver()"
        [class.disabled]="disabled()"
        (dragover)="onDragOver($event)"
        (dragleave)="onDragLeave($event)"
        (drop)="onDrop($event)"
        (click)="triggerFileInput()"
      >
        <input
          #fileInput
          type="file"
          [multiple]="config().multiple"
          [accept]="acceptedTypes()"
          (change)="onFileSelect($event)"
          hidden
        />

        <div class="upload-content">
          <mat-icon class="upload-icon" [class.spinning]="isUploading()">cloud_upload</mat-icon>
          <div class="upload-text">
            <h3>拖拽文件到此处或点击选择文件</h3>
            <p>支持 {{ acceptedTypesText() }} (单个文件最大 {{ maxFileSizeText() }})</p>
          </div>

          <div class="upload-hint">
            <mat-icon>info</mat-icon>
            <span>支持大文件分片上传、断点续传</span>
          </div>
        </div>
      </div>

      <div class="upload-options" *ngIf="showOptions()">
        <mat-form-field appearance="outline" class="option-field">
          <mat-label>上传到项目</mat-label>
          <mat-select [formControl]="projectIdControl">
            <mat-option value="">不关联项目</mat-option>
            <mat-option *ngFor="let project of projects()" [value]="project.id">
              {{ project.name }}
            </mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="option-field">
          <mat-label>访问权限</mat-label>
          <mat-select [formControl]="accessControl">
            <mat-option [value]="FileAccess.PRIVATE">私有</mat-option>
            <mat-option [value]="FileAccess.PROJECT">项目可见</mat-option>
            <mat-option [value]="FileAccess.PUBLIC">公开</mat-option>
          </mat-select>
        </mat-form-field>

        <mat-form-field appearance="outline" class="option-field">
          <mat-label>文件描述</mat-label>
          <input matInput [formControl]="descriptionControl" placeholder="可选">
        </mat-form-field>
      </div>

      <div class="upload-list" *ngIf="uploadQueue().length > 0">
        <div class="list-header">
          <h4>上传队列 ({{ uploadQueue().length }})</h4>
          <div class="list-actions">
            <button mat-button (click)="clearCompleted()">
              <mat-icon>clear_all</mat-icon>
              清空已完成
            </button>
          </div>
        </div>

        <div class="upload-items">
          <div
            *ngFor="let item of uploadQueue()"
            class="upload-item ancient-card"
            [class.completed]="item.progress.status === FileStatus.COMPLETED"
            [class.failed]="item.progress.status === FileStatus.FAILED"
            [class.paused]="item.progress.status === FileStatus.PAUSED"
          >
            <div class="item-header">
              <div class="item-info">
                <mat-icon class="item-icon">
                  {{ getFileIcon(item.file.type) }}
                </mat-icon>
                <div class="item-details">
                  <span class="item-name">{{ item.file.name }}</span>
                  <span class="item-size">{{ formatFileSize(item.file.size) }}</span>
                </div>
              </div>
              <div class="item-status">
                <span
                  class="status-badge"
                  [style.background]="getStatusColor(item.progress.status)"
                >
                  {{ getStatusText(item.progress.status) }}
                </span>
              </div>
            </div>

            <div class="item-progress">
              <mat-progress-bar
                mode="determinate"
                [value]="item.progress.progress"
                [color]="getProgressColor(item.progress.status)"
              ></mat-progress-bar>
              <div class="progress-info">
                <span class="progress-percent">
                  {{ item.progress.progress.toFixed(1) }}%
                </span>
                <span class="progress-chunks">
                  {{ item.progress.chunks.uploaded }}/{{ item.progress.chunks.total }} 分片
                </span>
                <span class="progress-speed" *ngIf="item.progress.speed > 0">
                  {{ formatSpeed(item.progress.speed) }}/s
                </span>
                <span class="progress-remaining" *ngIf="item.progress.remainingTime > 0">
                  剩余 {{ formatTime(item.progress.remainingTime) }}
                </span>
              </div>
            </div>

            <div class="item-actions" *ngIf="item.progress.status === FileStatus.UPLOADING || item.progress.status === FileStatus.PAUSED">
              <button
                mat-icon-button
                (click)="togglePause(item)"
                [matTooltip]="item.progress.status === FileStatus.PAUSED ? '继续' : '暂停'"
              >
                <mat-icon>{{ item.progress.status === FileStatus.PAUSED ? 'play_arrow' : 'pause' }}</mat-icon>
              </button>
              <button
                mat-icon-button
                (click)="cancelUpload(item)"
                matTooltip="取消"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <div class="item-actions" *ngIf="item.progress.status === FileStatus.FAILED">
              <button
                mat-icon-button
                (click)="retryUpload(item)"
                matTooltip="重试"
              >
                <mat-icon>refresh</mat-icon>
              </button>
              <button
                mat-icon-button
                (click)="removeItem(item)"
                matTooltip="移除"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <div class="item-actions" *ngIf="item.progress.status === FileStatus.COMPLETED">
              <button
                mat-icon-button
                (click)="previewFile(item)"
                matTooltip="预览"
              >
                <mat-icon>visibility</mat-icon>
              </button>
              <button
                mat-icon-button
                (click)="downloadFile(item)"
                matTooltip="下载"
              >
                <mat-icon>download</mat-icon>
              </button>
              <button
                mat-icon-button
                (click)="removeItem(item)"
                matTooltip="移除"
              >
                <mat-icon>delete</mat-icon>
              </button>
            </div>

            <div class="item-error" *ngIf="item.progress.error">
              <mat-icon>error</mat-icon>
              <span>{{ item.progress.error }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .file-upload-component {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .upload-area {
      border: 2px dashed #d4c9b5;
      border-radius: 8px;
      padding: 40px 20px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s;
      background: #faf7f0;

      &:hover {
        border-color: #c84c3b;
        background: #fff9f5;
      }

      &.drag-over {
        border-color: #c84c3b;
        background: #fff0ed;
      }

      &.disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      .upload-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 16px;

        .upload-icon {
          font-size: 64px;
          width: 64px;
          height: 64px;
          color: #c84c3b;

          &.spinning {
            animation: spin 1s linear infinite;
          }
        }

        .upload-text {
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

        .upload-hint {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: #9b8f7a;

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
          }
        }
      }
    }

    .upload-options {
      display: flex;
      gap: 16px;
      flex-wrap: wrap;

      .option-field {
        flex: 1;
        min-width: 200px;
      }
    }

    .upload-list {
      .list-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;

        h4 {
          margin: 0;
          font-size: 16px;
          color: #5d4e37;
          font-family: 'Noto Serif SC', serif;
        }
      }

      .upload-items {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .upload-item {
        padding: 16px;

        &.completed {
          border-left: 4px solid #4CAF50;
        }

        &.failed {
          border-left: 4px solid #F44336;
        }

        &.paused {
          border-left: 4px solid #FF9800;
        }

        .item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 12px;

          .item-info {
            display: flex;
            align-items: center;
            gap: 12px;

            .item-icon {
              font-size: 32px;
              width: 32px;
              color: #8b7d65;
            }

            .item-details {
              display: flex;
              flex-direction: column;

              .item-name {
                font-size: 14px;
                font-weight: 500;
                color: #2c2416;
              }

              .item-size {
                font-size: 12px;
                color: #9b8f7a;
              }
            }
          }

          .item-status {
            .status-badge {
              padding: 4px 12px;
              border-radius: 12px;
              font-size: 12px;
              color: #fff;
              background: #9e9e9e;
            }
          }
        }

        .item-progress {
          margin-bottom: 12px;

          .progress-info {
            display: flex;
            gap: 16px;
            font-size: 12px;
            color: #6b5d4a;
            margin-top: 8px;

            .progress-percent {
              font-weight: 500;
            }
          }
        }

        .item-actions {
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        }

        .item-error {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 8px 12px;
          background: #ffebee;
          border-radius: 4px;
          font-size: 12px;
          color: #c62828;

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
          }
        }
      }
    }

    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `]
})
export class FileUploadComponent implements OnInit, OnDestroy {
  private readonly fileService = inject(FileService);
  private readonly destroy$ = new Subject<void>();

  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  @Input() config = signal<Partial<DropzoneConfig>>({
    multiple: true,
    maxFiles: 10,
    maxFileSize: 500 * 1024 * 1024,
    acceptedTypes: ['image/*', 'application/pdf', '.zip', '.rar', '.7z'],
    autoUpload: true,
    chunkSize: 5 * 1024 * 1024,
    parallelChunks: 3,
    retryAttempts: 3
  });

  @Input() disabled = signal(false);
  @Input() showOptions = signal(true);
  @Input() projects = signal<{ id: string; name: string }[]>([]);

  @Output() uploadComplete = new EventEmitter<FileInfo>();
  @Output() uploadError = new EventEmitter<Error>();
  @Output() fileSelected = new EventEmitter<File>();

  readonly FileStatus = FileStatus;
  readonly FileAccess = FileAccess;

  readonly isDragOver = signal(false);
  readonly isUploading = signal(false);
  readonly uploadQueue = signal<UploadQueueItem[]>([]);

  readonly projectIdControl = new FormControl('');
  readonly accessControl = new FormControl<FileAccess>(FileAccess.PRIVATE);
  readonly descriptionControl = new FormControl('');

  private progressSubscription?: Subscription;

  ngOnInit(): void {
    this.progressSubscription = this.fileService.progress$
      .pipe(takeUntil(this.destroy$))
      .subscribe(progress => {
        this.updateProgress(progress);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
    }
  }

  acceptedTypes(): string {
    return this.config().acceptedTypes?.join(',') || '*/*';
  }

  acceptedTypesText(): string {
    const types = this.config().acceptedTypes || [];
    if (types.length === 0) return '所有文件';
    return types.map(t => {
      if (t.startsWith('image/')) return '图片';
      if (t === 'application/pdf') return 'PDF';
      if (t.startsWith('.')) return t.toUpperCase();
      return t;
    }).join('、');
  }

  maxFileSizeText(): string {
    return this.fileService.formatFileSize(this.config().maxFileSize || 0);
  }

  onDragOver(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    if (this.disabled()) return;
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = event.dataTransfer?.files;
    if (files && files.length > 0) {
      this.handleFiles(Array.from(files));
    }
  }

  triggerFileInput(): void {
    if (this.disabled()) return;
    this.fileInput.nativeElement.click();
  }

  onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = input.files;
    if (files && files.length > 0) {
      this.handleFiles(Array.from(files));
    }
    input.value = '';
  }

  private handleFiles(files: File[]): void {
    const validFiles = files.filter(file => this.validateFile(file));

    validFiles.forEach(file => {
      this.fileSelected.emit(file);

      const item: UploadQueueItem = {
        id: this.generateId(),
        file,
        progress: {
          fileId: '',
          fileName: file.name,
          totalSize: file.size,
          uploadedSize: 0,
          progress: 0,
          speed: 0,
          remainingTime: 0,
          status: FileStatus.UPLOADING,
          chunks: { total: 0, uploaded: 0, failed: 0 }
        }
      };

      this.uploadQueue.update(prev => [...prev, item]);

      if (this.config().autoUpload) {
        this.startUpload(item);
      }
    });
  }

  private validateFile(file: File): boolean {
    const maxSize = this.config().maxFileSize || 500 * 1024 * 1024;

    if (file.size > maxSize) {
      this.uploadError.emit(new Error(`文件 ${file.name} 超过最大大小限制`));
      return false;
    }

    const acceptedTypes = this.config().acceptedTypes || [];
    if (acceptedTypes.length > 0) {
      const isValid = acceptedTypes.some(type => {
        if (type.startsWith('.')) {
          return file.name.toLowerCase().endsWith(type.toLowerCase());
        }
        if (type.endsWith('/*')) {
          return file.type.startsWith(type.slice(0, -2));
        }
        return file.type === type;
      });

      if (!isValid) {
        this.uploadError.emit(new Error(`文件 ${file.name} 类型不支持`));
        return false;
      }
    }

    return true;
  }

  private startUpload(item: UploadQueueItem): void {
    this.isUploading.set(true);

    this.fileService.uploadFile(item.file, {
      ...this.config(),
      projectId: this.projectIdControl.value || undefined,
      access: this.accessControl.value || undefined,
      description: this.descriptionControl.value || undefined
    }).subscribe({
      next: (progress) => {
        item.progress = progress;
        this.uploadQueue.update(prev => [...prev]);
      },
      error: (error) => {
        item.progress.status = FileStatus.FAILED;
        item.progress.error = error.message;
        this.uploadQueue.update(prev => [...prev]);
        this.uploadError.emit(error);
        this.checkUploadingStatus();
      },
      complete: () => {
        this.uploadComplete.emit();
        this.checkUploadingStatus();
      }
    });
  }

  private updateProgress(progress: UploadProgress): void {
    const item = this.uploadQueue().find(i => i.progress.fileId === progress.fileId);
    if (item) {
      item.progress = progress;
      this.uploadQueue.update(prev => [...prev]);
    }
  }

  togglePause(item: UploadQueueItem): void {
    if (item.progress.status === FileStatus.PAUSED) {
      this.fileService.resumeUpload(item.progress.fileId).subscribe({
        next: (progress) => {
          item.progress = progress;
          this.uploadQueue.update(prev => [...prev]);
        },
        error: (error) => {
          item.progress.status = FileStatus.FAILED;
          item.progress.error = error.message;
          this.uploadQueue.update(prev => [...prev]);
        }
      });
    } else {
      this.fileService.pauseUpload(item.progress.fileId);
    }
  }

  cancelUpload(item: UploadQueueItem): void {
    this.fileService.cancelUpload(item.progress.fileId);
    this.removeItem(item);
    this.checkUploadingStatus();
  }

  retryUpload(item: UploadQueueItem): void {
    item.progress.status = FileStatus.UPLOADING;
    item.progress.error = undefined;
    this.uploadQueue.update(prev => [...prev]);
    this.startUpload(item);
  }

  removeItem(item: UploadQueueItem): void {
    this.uploadQueue.update(prev => prev.filter(i => i.id !== item.id));
    this.checkUploadingStatus();
  }

  clearCompleted(): void {
    this.uploadQueue.update(prev =>
      prev.filter(item =>
        item.progress.status !== FileStatus.COMPLETED
      )
    );
    this.checkUploadingStatus();
  }

  previewFile(item: UploadQueueItem): void {
    console.log('Preview file:', item.file.name);
  }

  downloadFile(item: UploadQueueItem): void {
    if (item.progress.fileId) {
      this.fileService.downloadFile(item.progress.fileId).subscribe();
    }
  }

  private checkUploadingStatus(): void {
    const hasUploading = this.uploadQueue().some(
      item => item.progress.status === FileStatus.UPLOADING
    );
    this.isUploading.set(hasUploading);
  }

  getFileIcon(type: string): string {
    const fileType = this.fileService.getFileTypeFromMimeType(type);
    return this.fileService.getFileIcon(fileType);
  }

  formatFileSize(bytes: number): string {
    return this.fileService.formatFileSize(bytes);
  }

  formatSpeed(bytesPerSecond: number): string {
    return this.fileService.formatFileSize(bytesPerSecond);
  }

  formatTime(seconds: number): string {
    if (seconds < 60) return `${Math.ceil(seconds)}秒`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)}分钟`;
    return `${Math.ceil(seconds / 3600)}小时`;
  }

  getStatusColor(status: FileStatus): string {
    return this.fileService.getStatusColor(status);
  }

  getStatusText(status: FileStatus): string {
    return this.fileService.getStatusText(status);
  }

  getProgressColor(status: FileStatus): 'primary' | 'accent' | 'warn' {
    switch (status) {
      case FileStatus.COMPLETED:
        return 'primary';
      case FileStatus.FAILED:
        return 'warn';
      default:
        return 'accent';
    }
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15);
  }
}

export interface UploadQueueItem {
  id: string;
  file: File;
  progress: UploadProgress;
}

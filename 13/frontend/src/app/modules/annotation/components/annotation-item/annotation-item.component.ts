// 批注项组件 - 单个批注展示，包含作者信息、时间、内容、回复列表

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatAvatar } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, Subscription, takeUntil } from 'rxjs';
import { AnnotationEditorComponent } from '../annotation-editor/annotation-editor.component';
import { AnnotationService } from '../../services/annotation.service';
import { RealtimeAnnotationService } from '../../services/realtime-annotation.service';
import { AuthService } from '@core/services/auth.service';
import {
  Annotation,
  AnnotationReply,
  AnnotationStatus,
  AnnotationPriority,
  MentionUser,
  UpdateAnnotationRequest,
  UpdateAnnotationReplyRequest,
  CreateAnnotationReplyRequest
} from '@core/models/annotation.model';

@Component({
  selector: 'app-annotation-item',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatMenuModule,
    MatSelectModule,
    MatTooltipModule,
    MatChipsModule,
    MatAvatar,
    MatDividerModule,
    MatProgressSpinnerModule,
    AnnotationEditorComponent,
    DatePipe
  ],
  template: `
    <div
      class="annotation-item"
      [class.expanded]="isExpanded()"
      [class.unread]="!isRead()"
      [class.resolved]="annotation().status === AnnotationStatus.RESOLVED"
      [class.closed]="annotation().status === AnnotationStatus.CLOSED"
    >
      <div class="annotation-header" (click)="toggleExpand()">
        <div class="annotation-meta">
          <div class="author-avatar">
            <img
              *ngIf="annotation().author?.avatar"
              [src]="annotation().author?.avatar"
              [alt]="annotation().author?.nickname"
            />
            <span *ngIf="!annotation().author?.avatar" class="avatar-placeholder">
              {{ annotation().author?.nickname?.charAt(0) || '?' }}
            </span>
          </div>
          <div class="author-info">
            <span class="author-name">{{ annotation().author?.nickname || '未知用户' }}</span>
            <span class="annotation-time">
              {{ formatTime(annotation().createdAt) }}
              <span *ngIf="annotation().isEdited" class="edited-badge">(已编辑)</span>
            </span>
          </div>
        </div>

        <div class="annotation-status-bar">
          <span class="priority-badge" [class]="'priority-' + annotation().priority.toLowerCase()">
            {{ getPriorityLabel(annotation().priority) }}
          </span>
          <span class="status-badge" [class]="'status-' + annotation().status.toLowerCase()">
            {{ getStatusLabel(annotation().status) }}
          </span>
          <button
            mat-icon-button
            class="expand-toggle"
            (click)="$event.stopPropagation()"
          >
            <mat-icon>{{ isExpanded() ? 'expand_less' : 'expand_more' }}</mat-icon>
          </button>
        </div>
      </div>

      <div class="annotation-body" *ngIf="isExpanded()">
        <div class="annotation-title" *ngIf="annotation().title">
          <h4>{{ annotation().title }}</h4>
        </div>

        <div class="selected-text-preview">
          <mat-icon>format_quote</mat-icon>
          <div class="text-content">
            <span class="context" *ngIf="annotation().selection.contextBefore">
              {{ annotation().selection.contextBefore }}
            </span>
            <span class="highlight">{{ annotation().selection.selectedText }}</span>
            <span class="context" *ngIf="annotation().selection.contextAfter">
              {{ annotation().selection.contextAfter }}
            </span>
          </div>
          <button
            mat-icon-button
            (click)="onNavigateToSelection()"
            matTooltip="定位到文本"
          >
            <mat-icon>open_in_new</mat-icon>
          </button>
        </div>

        <div class="annotation-content">
          <p [innerHTML]="renderContent(annotation().content, annotation().mentions)"></p>
        </div>

        <div class="annotation-meta-info" *ngIf="annotation().tags?.length > 0 || annotation().assignee">
          <div class="tags-section" *ngIf="annotation().tags?.length > 0">
            <mat-icon class="meta-icon">label</mat-icon>
            <mat-chip-listbox>
              <mat-chip *ngFor="let tag of annotation().tags">
                {{ tag }}
              </mat-chip>
            </mat-chip-listbox>
          </div>

          <div class="assignee-section" *ngIf="annotation().assignee">
            <mat-icon class="meta-icon">assignment_ind</mat-icon>
            <span class="assignee-label">指派给:</span>
            <span class="assignee-name">{{ annotation().assignee.nickname }}</span>
          </div>
        </div>

        <div class="annotation-actions">
          <div class="actions-left">
            <button
              mat-button
              (click)="toggleReplyEditor()"
              [disabled]="isLoading()"
            >
              <mat-icon>reply</mat-icon>
              回复 ({{ annotation().replyCount }})
            </button>
            <button
              mat-button
              [matMenuTriggerFor]="statusMenu"
              [disabled]="!canEdit() || isLoading()"
            >
              <mat-icon>flag</mat-icon>
              更新状态
            </button>
            <button
              mat-button
              *ngIf="canEdit()"
              (click)="toggleEditMode()"
              [disabled]="isLoading()"
            >
              <mat-icon>edit</mat-icon>
              编辑
            </button>
          </div>

          <div class="actions-right">
            <button
              mat-button
              *ngIf="canDelete()"
              (click)="onDelete()"
              [disabled]="isLoading()"
              class="delete-btn"
            >
              <mat-icon>delete</mat-icon>
              删除
            </button>
          </div>
        </div>

        <mat-menu #statusMenu="matMenu">
          <button
            mat-menu-item
            (click)="updateStatus(AnnotationStatus.OPEN)"
            [disabled]="annotation().status === AnnotationStatus.OPEN"
          >
            <span class="status-dot open"></span>
            打开
          </button>
          <button
            mat-menu-item
            (click)="updateStatus(AnnotationStatus.RESOLVED)"
            [disabled]="annotation().status === AnnotationStatus.RESOLVED"
          >
            <span class="status-dot resolved"></span>
            已解决
          </button>
          <button
            mat-menu-item
            (click)="updateStatus(AnnotationStatus.CLOSED)"
            [disabled]="annotation().status === AnnotationStatus.CLOSED"
          >
            <span class="status-dot closed"></span>
            已关闭
          </button>
        </mat-menu>

        <div class="reply-editor-wrapper" *ngIf="showReplyEditor()">
          <app-annotation-editor
            mode="reply"
            [projectId]="annotation().projectId"
            [documentId]="annotation().documentId"
            [annotationId]="annotation().id"
            placeholder="输入回复内容..."
            (cancel)="toggleReplyEditor()"
            (submitSuccess)="onReplyCreated($event)"
          ></app-annotation-editor>
        </div>

        <div class="edit-editor-wrapper" *ngIf="isEditing()">
          <mat-form-field appearance="outline" class="edit-content-input">
            <mat-label>编辑批注内容</mat-label>
            <textarea
              matInput
              [formControl]="editContentControl"
              rows="4"
            ></textarea>
          </mat-form-field>
          <div class="edit-actions">
            <button
              mat-button
              (click)="cancelEdit()"
              [disabled]="isSaving()"
            >
              取消
            </button>
            <button
              mat-raised-button
              color="primary"
              (click)="saveEdit()"
              [disabled]="!editContentControl.valid || isSaving()"
            >
              <mat-spinner diameter="16" *ngIf="isSaving()"></mat-spinner>
              <span *ngIf="!isSaving()">保存</span>
            </button>
          </div>
        </div>

        <div class="replies-section" *ngIf="annotation().replies?.length > 0">
          <div class="replies-header">
            <span class="replies-count">{{ annotation().replies.length }} 条回复</span>
          </div>

          <div class="reply-list">
            <div
              class="reply-item"
              *ngFor="let reply of annotation().replies"
              [class.editing-reply]="editingReplyId() === reply.id"
            >
              <div class="reply-header">
                <div class="reply-author">
                  <div class="reply-avatar">
                    <img
                      *ngIf="reply.author?.avatar"
                      [src]="reply.author?.avatar"
                      [alt]="reply.author?.nickname"
                    />
                    <span *ngIf="!reply.author?.avatar" class="avatar-placeholder">
                      {{ reply.author?.nickname?.charAt(0) || '?' }}
                    </span>
                  </div>
                  <div class="reply-author-info">
                    <span class="reply-author-name">
                      {{ reply.author?.nickname || '未知用户' }}
                    </span>
                    <span class="reply-time">
                      {{ formatTime(reply.createdAt) }}
                      <span *ngIf="reply.isEdited" class="edited-badge">(已编辑)</span>
                    </span>
                  </div>
                </div>

                <div class="reply-actions" *ngIf="canEditReply(reply)">
                  <button
                    mat-icon-button
                    [matMenuTriggerFor]="replyMenu"
                    [disabled]="isLoading()"
                  >
                    <mat-icon>more_vert</mat-icon>
                  </button>

                  <mat-menu #replyMenu="matMenu">
                    <button mat-menu-item (click)="startEditReply(reply)">
                      <mat-icon>edit</mat-icon>
                      编辑
                    </button>
                    <button mat-menu-item (click)="deleteReply(reply)" class="delete-menu-item">
                      <mat-icon>delete</mat-icon>
                      删除
                    </button>
                  </mat-menu>
                </div>
              </div>

              <div class="reply-content" *ngIf="editingReplyId() !== reply.id">
                <p [innerHTML]="renderContent(reply.content, reply.mentions)"></p>
              </div>

              <div class="reply-edit-form" *ngIf="editingReplyId() === reply.id">
                <mat-form-field appearance="outline" class="edit-reply-input">
                  <textarea
                    matInput
                    [formControl]="editReplyControl"
                    rows="3"
                  ></textarea>
                </mat-form-field>
                <div class="edit-reply-actions">
                  <button
                    mat-button
                    (click)="cancelEditReply()"
                    [disabled]="isSaving()"
                  >
                    取消
                  </button>
                  <button
                    mat-raised-button
                    color="primary"
                    (click)="saveEditReply(reply)"
                    [disabled]="!editReplyControl.valid || isSaving()"
                  >
                    <mat-spinner diameter="16" *ngIf="isSaving()"></mat-spinner>
                    <span *ngIf="!isSaving()">保存</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="annotation-preview" *ngIf="!isExpanded()" (click)="toggleExpand()">
        <p class="preview-text">
          {{ truncateText(annotation().content, 100) }}
        </p>
        <div class="preview-meta">
          <span class="reply-count">
            <mat-icon>mode_comment</mat-icon>
            {{ annotation().replyCount }}
          </span>
          <span *ngIf="annotation().mentions?.length > 0" class="mention-count">
            <mat-icon>alternate_email</mat-icon>
            {{ annotation().mentions.length }}
          </span>
        </div>
      </div>
    </div>
  `,
  styles: [
    `
      .annotation-item {
        background: #fff;
        border: 1px solid #d4c9b5;
        border-radius: 8px;
        margin-bottom: 12px;
        overflow: hidden;
        transition: all 0.3s ease;

        &.unread {
          border-left: 4px solid #c84c3b;
        }

        &.expanded {
          box-shadow: 0 4px 12px rgba(93, 78, 55, 0.1);
        }

        &.resolved {
          opacity: 0.85;
        }

        &.closed {
          opacity: 0.7;
        }
      }

      .annotation-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        background: #faf7f0;
        border-bottom: 1px solid #e5dccb;
        cursor: pointer;
        transition: background-color 0.2s;

        &:hover {
          background: #f5f0e6;
        }

        .annotation-meta {
          display: flex;
          align-items: center;
          gap: 12px;

          .author-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #c84c3b;
            color: #fff;
            font-weight: 600;
            font-size: 14px;
            flex-shrink: 0;

            img {
              width: 100%;
              height: 100%;
              object-fit: cover;
            }

            .avatar-placeholder {
              text-transform: uppercase;
            }
          }

          .author-info {
            display: flex;
            flex-direction: column;

            .author-name {
              font-size: 14px;
              font-weight: 600;
              color: #2c2416;
            }

            .annotation-time {
              font-size: 12px;
              color: #9b8f7a;

              .edited-badge {
                font-style: italic;
                margin-left: 4px;
              }
            }
          }
        }

        .annotation-status-bar {
          display: flex;
          align-items: center;
          gap: 8px;

          .priority-badge,
          .status-badge {
            padding: 4px 10px;
            border-radius: 12px;
            font-size: 11px;
            font-weight: 500;
          }

          .priority-badge {
            &.priority-low {
              background: #e8f0ea;
              color: #4a7c59;
            }
            &.priority-medium {
              background: #faf2e0;
              color: #c89b3b;
            }
            &.priority-high {
              background: #fdeedc;
              color: #e07a3b;
            }
            &.priority-urgent {
              background: #fbe8e5;
              color: #c84c3b;
            }
          }

          .status-badge {
            &.status-open {
              background: #e8f0f5;
              color: #3b6c8c;
            }
            &.status-resolved {
              background: #e8f0ea;
              color: #4a7c59;
            }
            &.status-closed {
              background: #f0ecec;
              color: #8c6b6b;
            }
          }

          .expand-toggle {
            color: #9b8f7a;
          }
        }
      }

      .annotation-body {
        padding: 16px;

        .annotation-title {
          margin-bottom: 12px;

          h4 {
            margin: 0;
            font-size: 16px;
            font-weight: 600;
            color: #5d4e37;
            font-family: 'Noto Serif SC', serif;
          }
        }

        .selected-text-preview {
          display: flex;
          gap: 12px;
          padding: 12px;
          background: #f5f0e6;
          border-radius: 6px;
          margin-bottom: 16px;
          border-left: 3px solid #c84c3b;

          > mat-icon {
            color: #c84c3b;
            font-size: 20px;
            width: 20px;
            height: 20px;
            flex-shrink: 0;
          }

          .text-content {
            flex: 1;
            font-size: 13px;
            line-height: 1.6;
            color: #6b5d4a;

            .context {
              color: #9b8f7a;
            }

            .highlight {
              background: #fff3cd;
              padding: 1px 2px;
              border-radius: 2px;
              color: #5d4e37;
              font-weight: 500;
            }
          }

          button {
            flex-shrink: 0;
            color: #6b5d4a;
          }
        }

        .annotation-content {
          margin-bottom: 16px;
          font-size: 14px;
          line-height: 1.7;
          color: #2c2416;

          p {
            margin: 0;
          }

          :deep(.mention) {
            color: #c84c3b;
            font-weight: 500;
            background: #fbe8e5;
            padding: 1px 4px;
            border-radius: 3px;
          }
        }

        .annotation-meta-info {
          display: flex;
          flex-wrap: wrap;
          gap: 16px;
          margin-bottom: 16px;
          padding: 12px;
          background: #faf7f0;
          border-radius: 6px;

          .tags-section,
          .assignee-section {
            display: flex;
            align-items: center;
            gap: 8px;

            .meta-icon {
              font-size: 18px;
              width: 18px;
              height: 18px;
              color: #9b8f7a;
            }

            .assignee-label {
              font-size: 13px;
              color: #6b5d4a;
            }

            .assignee-name {
              font-size: 13px;
              font-weight: 500;
              color: #5d4e37;
            }
          }
        }

        .annotation-actions {
          display: flex;
          justify-content: space-between;
          padding-top: 12px;
          border-top: 1px solid #e5dccb;

          .actions-left,
          .actions-right {
            display: flex;
            gap: 8px;
          }

          button {
            color: #6b5d4a;

            &.delete-btn {
              color: #c84c3b;
            }
          }
        }

        .status-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 8px;

          &.open {
            background: #3b6c8c;
          }
          &.resolved {
            background: #4a7c59;
          }
          &.closed {
            background: #8c6b6b;
          }
        }

        .reply-editor-wrapper {
          margin-top: 16px;
        }

        .edit-editor-wrapper {
          margin-top: 16px;

          .edit-content-input {
            width: 100%;
          }

          .edit-actions {
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            margin-top: 8px;

            mat-spinner {
              display: inline-block;
              vertical-align: middle;
              margin-right: 8px;
            }
          }
        }

        .replies-section {
          margin-top: 20px;

          .replies-header {
            margin-bottom: 12px;
            padding-bottom: 8px;
            border-bottom: 1px solid #e5dccb;

            .replies-count {
              font-size: 13px;
              font-weight: 600;
              color: #5d4e37;
            }
          }

          .reply-list {
            .reply-item {
              padding: 12px;
              background: #faf7f0;
              border-radius: 6px;
              margin-bottom: 8px;

              &:last-child {
                margin-bottom: 0;
              }

              .reply-header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                margin-bottom: 8px;

                .reply-author {
                  display: flex;
                  align-items: center;
                  gap: 8px;

                  .reply-avatar {
                    width: 28px;
                    height: 28px;
                    border-radius: 50%;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: #5d4e37;
                    color: #fff;
                    font-weight: 600;
                    font-size: 12px;

                    img {
                      width: 100%;
                      height: 100%;
                      object-fit: cover;
                    }
                  }

                  .reply-author-info {
                    display: flex;
                    flex-direction: column;

                    .reply-author-name {
                      font-size: 13px;
                      font-weight: 600;
                      color: #2c2416;
                    }

                    .reply-time {
                      font-size: 11px;
                      color: #9b8f7a;

                      .edited-badge {
                        font-style: italic;
                        margin-left: 4px;
                      }
                    }
                  }
                }

                .reply-actions {
                  button {
                    color: #9b8f7a;
                  }
                }
              }

              .reply-content {
                font-size: 13px;
                line-height: 1.6;
                color: #2c2416;

                p {
                  margin: 0;
                }

                :deep(.mention) {
                  color: #c84c3b;
                  font-weight: 500;
                  background: #fbe8e5;
                  padding: 1px 4px;
                  border-radius: 3px;
                }
              }

              .reply-edit-form {
                .edit-reply-input {
                  width: 100%;
                }

                .edit-reply-actions {
                  display: flex;
                  justify-content: flex-end;
                  gap: 8px;
                  margin-top: 8px;

                  mat-spinner {
                    display: inline-block;
                    vertical-align: middle;
                    margin-right: 8px;
                  }
                }
              }
            }
          }
        }
      }

      .annotation-preview {
        padding: 12px 16px;
        cursor: pointer;

        .preview-text {
          margin: 0 0 8px 0;
          font-size: 13px;
          color: #6b5d4a;
          line-height: 1.5;
        }

        .preview-meta {
          display: flex;
          gap: 16px;

          .reply-count,
          .mention-count {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 12px;
            color: #9b8f7a;

            mat-icon {
              font-size: 14px;
              width: 14px;
              height: 14px;
            }
          }
        }
      }

      .delete-menu-item {
        color: #c84c3b;
      }
    `
  ]
})
export class AnnotationItemComponent implements OnInit, OnDestroy {
  private annotationService = inject(AnnotationService);
  private realtimeService = inject(RealtimeAnnotationService);
  private authService = inject(AuthService);

  @Input({ required: true }) annotation = signal<Annotation>({} as Annotation);
  @Input() isRead = signal(true);

  @Output() navigateToSelection = new EventEmitter<Annotation>();
  @Output() deleted = new EventEmitter<string>();
  @Output() updated = new EventEmitter<Annotation>();

  isExpanded = signal(false);
  showReplyEditor = signal(false);
  isEditing = signal(false);
  isLoading = signal(false);
  isSaving = signal(false);
  editingReplyId = signal<string | null>(null);

  editContentControl = new FormControl('', [Validators.required]);
  editReplyControl = new FormControl('', [Validators.required]);

  private destroy$ = new Subject<void>();
  private realtimeSubscription?: Subscription;

  AnnotationStatus = AnnotationStatus;
  AnnotationPriority = AnnotationPriority;

  currentUserId = computed(() => this.authService.currentUser()?.id);

  canEdit = computed(() => {
    return this.annotation().authorId === this.currentUserId();
  });

  canDelete = computed(() => {
    return this.annotation().authorId === this.currentUserId();
  });

  ngOnInit(): void {
    this.setupRealtimeListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.realtimeSubscription?.unsubscribe();
  }

  /**
   * 设置实时监听器
   */
  private setupRealtimeListeners(): void {
    this.realtimeSubscription = this.realtimeService
      .onAnnotationEvents(this.annotation().id)
      .pipe(takeUntil(this.destroy$))
      .subscribe((event) => {
        switch (event.eventType) {
          case 'updated':
            this.annotation.set(event.data);
            this.updated.emit(event.data);
            break;
          case 'replyCreated':
            const updatedAnnotation = { ...this.annotation() };
            updatedAnnotation.replies = [...updatedAnnotation.replies, event.data.reply];
            updatedAnnotation.replyCount++;
            this.annotation.set(updatedAnnotation);
            this.updated.emit(updatedAnnotation);
            break;
          case 'replyUpdated':
            const ann = { ...this.annotation() };
            const replyIndex = ann.replies.findIndex((r) => r.id === event.data.reply.id);
            if (replyIndex !== -1) {
              ann.replies[replyIndex] = event.data.reply;
              this.annotation.set(ann);
              this.updated.emit(ann);
            }
            break;
          case 'replyDeleted':
            const ann2 = { ...this.annotation() };
            ann2.replies = ann2.replies.filter((r) => r.id !== event.data.replyId);
            ann2.replyCount--;
            this.annotation.set(ann2);
            this.updated.emit(ann2);
            break;
        }
      });
  }

  /**
   * 切换展开状态
   */
  toggleExpand(): void {
    this.isExpanded.set(!this.isExpanded());
    if (this.isExpanded() && !this.isRead()) {
      this.annotationService.markAsRead(this.annotation().id).subscribe();
    }
  }

  /**
   * 切换回复编辑器
   */
  toggleReplyEditor(): void {
    this.showReplyEditor.set(!this.showReplyEditor());
    if (this.showReplyEditor()) {
      this.isEditing.set(false);
    }
  }

  /**
   * 切换编辑模式
   */
  toggleEditMode(): void {
    this.isEditing.set(!this.isEditing());
    if (this.isEditing()) {
      this.editContentControl.setValue(this.annotation().content);
      this.showReplyEditor.set(false);
    }
  }

  /**
   * 取消编辑
   */
  cancelEdit(): void {
    this.isEditing.set(false);
    this.editContentControl.reset('');
  }

  /**
   * 保存编辑
   */
  saveEdit(): void {
    if (!this.editContentControl.valid) return;

    this.isSaving.set(true);
    const request: UpdateAnnotationRequest = {
      content: this.editContentControl.value!
    };

    this.annotationService
      .updateAnnotation(this.annotation().id, request)
      .subscribe({
        next: (annotation) => {
          this.isSaving.set(false);
          this.isEditing.set(false);
          this.annotation.set(annotation);
          this.realtimeService.sendAnnotationUpdated(annotation);
          this.updated.emit(annotation);
        },
        error: () => {
          this.isSaving.set(false);
        }
      });
  }

  /**
   * 更新状态
   */
  updateStatus(status: AnnotationStatus): void {
    this.isLoading.set(true);
    this.annotationService
      .updateStatus(this.annotation().id, status)
      .subscribe({
        next: (annotation) => {
          this.isLoading.set(false);
          this.annotation.set(annotation);
          this.realtimeService.sendAnnotationUpdated(annotation);
          this.updated.emit(annotation);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  /**
   * 删除批注
   */
  onDelete(): void {
    if (!confirm('确定要删除这条批注吗？')) return;

    this.isLoading.set(true);
    this.annotationService
      .deleteAnnotation(this.annotation().id)
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.realtimeService.sendAnnotationDeleted(
            this.annotation().id,
            this.annotation().projectId,
            this.annotation().documentId
          );
          this.deleted.emit(this.annotation().id);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  /**
   * 跳转到选中文本
   */
  onNavigateToSelection(): void {
    this.navigateToSelection.emit(this.annotation());
  }

  /**
   * 回复创建成功
   */
  onReplyCreated(reply: AnnotationReply): void {
    this.showReplyEditor.set(false);
  }

  /**
   * 检查是否可以编辑回复
   */
  canEditReply(reply: AnnotationReply): boolean {
    return reply.authorId === this.currentUserId();
  }

  /**
   * 开始编辑回复
   */
  startEditReply(reply: AnnotationReply): void {
    this.editingReplyId.set(reply.id);
    this.editReplyControl.setValue(reply.content);
  }

  /**
   * 取消编辑回复
   */
  cancelEditReply(): void {
    this.editingReplyId.set(null);
    this.editReplyControl.reset('');
  }

  /**
   * 保存编辑回复
   */
  saveEditReply(reply: AnnotationReply): void {
    if (!this.editReplyControl.valid) return;

    this.isSaving.set(true);
    const request: UpdateAnnotationReplyRequest = {
      content: this.editReplyControl.value!,
      mentions: []
    };

    this.annotationService
      .updateReply(this.annotation().id, reply.id, request)
      .subscribe({
        next: (updatedReply) => {
          this.isSaving.set(false);
          this.editingReplyId.set(null);
          this.editReplyControl.reset('');
          this.realtimeService.sendReplyUpdated(
            this.annotation().id,
            updatedReply,
            this.annotation().projectId,
            this.annotation().documentId
          );
        },
        error: () => {
          this.isSaving.set(false);
        }
      });
  }

  /**
   * 删除回复
   */
  deleteReply(reply: AnnotationReply): void {
    if (!confirm('确定要删除这条回复吗？')) return;

    this.isLoading.set(true);
    this.annotationService
      .deleteReply(this.annotation().id, reply.id)
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.realtimeService.sendReplyDeleted(
            this.annotation().id,
            reply.id,
            this.annotation().projectId,
            this.annotation().documentId
          );
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  /**
   * 渲染内容（处理@提及）
   */
  renderContent(content: string, mentions: MentionUser[] = []): string {
    let rendered = this.escapeHtml(content);

    mentions.forEach((mention) => {
      const mentionText = `@${mention.nickname}`;
      const mentionHtml = `<span class="mention" title="${mention.username}">${mentionText}</span>`;
      rendered = rendered.replace(
        new RegExp(this.escapeRegex(mentionText), 'g'),
        mentionHtml
      );
    });

    rendered = rendered.replace(/\n/g, '<br>');

    return rendered;
  }

  /**
   * HTML转义
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 正则表达式转义
   */
  private escapeRegex(text: string): string {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * 格式化时间
   */
  formatTime(date: Date | string): string {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;

    return d.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 获取状态标签
   */
  getStatusLabel(status: AnnotationStatus): string {
    const labels: Record<AnnotationStatus, string> = {
      [AnnotationStatus.OPEN]: '打开',
      [AnnotationStatus.RESOLVED]: '已解决',
      [AnnotationStatus.CLOSED]: '已关闭'
    };
    return labels[status];
  }

  /**
   * 获取优先级标签
   */
  getPriorityLabel(priority: AnnotationPriority): string {
    const labels: Record<AnnotationPriority, string> = {
      [AnnotationPriority.LOW]: '低',
      [AnnotationPriority.MEDIUM]: '中',
      [AnnotationPriority.HIGH]: '高',
      [AnnotationPriority.URGENT]: '紧急'
    };
    return labels[priority];
  }

  /**
   * 截断文本
   */
  truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

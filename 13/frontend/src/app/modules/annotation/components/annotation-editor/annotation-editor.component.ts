// 批注编辑器组件 - 支持@提及用户、Markdown、文本选择关联

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
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormControl, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Subject, Subscription, debounceTime } from 'rxjs';
import { MentionDropdownComponent } from '../mention-dropdown/mention-dropdown.component';
import { AnnotationService } from '../../services/annotation.service';
import { RealtimeAnnotationService } from '../../services/realtime-annotation.service';
import {
  MentionUser,
  TextSelection,
  CreateAnnotationRequest,
  CreateAnnotationReplyRequest,
  AnnotationPriority
} from '@core/models/annotation.model';
import { AuthService } from '@core/services/auth.service';

@Component({
  selector: 'app-annotation-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatInputModule,
    MatSelectModule,
    MatChipsModule,
    MatIconModule,
    MatTooltipModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MentionDropdownComponent
  ],
  template: `
    <div class="annotation-editor">
      <div class="editor-header" *ngIf="mode() === 'create'">
        <h3 class="editor-title">新建批注</h3>
        <div class="selection-info" *ngIf="selection()">
          <mat-icon>text_select_move_forward</mat-icon>
          <span class="selection-text" [title]="selection()?.selectedText">
            已选文本: {{ truncateText(selection()?.selectedText || '', 30) }}
          </span>
          <button mat-icon-button (click)="clearSelection()" matTooltip="清除选区">
            <mat-icon>close</mat-icon>
          </button>
        </div>
      </div>

      <div class="editor-form">
        <div class="form-row" *ngIf="mode() === 'create'">
          <mat-form-field appearance="outline" class="title-input">
            <mat-label>标题（可选）</mat-label>
            <input matInput [formControl]="titleControl" placeholder="简短描述此批注..." />
          </mat-form-field>
        </div>

        <div class="form-row">
          <mat-form-field appearance="outline" class="content-input">
            <mat-label>{{ mode() === 'create' ? '批注内容' : '回复内容' }}</mat-label>
            <textarea
              #contentTextarea
              matInput
              [formControl]="contentControl"
              [placeholder]="placeholder()"
              rows="4"
              (input)="onContentInput($event)"
              (keydown)="onKeyDown($event)"
              (click)="onEditorClick($event)"
            ></textarea>
            <mat-hint align="start">
              支持 @提及用户 和 Markdown 语法
            </mat-hint>
            <mat-hint align="end">
              {{ contentControl.value?.length || 0 }}/2000
            </mat-hint>
          </mat-form-field>
        </div>

        <div class="mention-preview" *ngIf="mentions().length > 0">
          <span class="mention-label">已提及:</span>
          <mat-chip-listbox>
            <mat-chip
              *ngFor="let mention of mentions()"
              [removable]="true"
              (removed)="removeMention(mention)"
            >
              <span class="mention-chip-text">{{ mention.nickname }}</span>
              <button matChipRemove>
                <mat-icon>cancel</mat-icon>
              </button>
            </mat-chip>
          </mat-chip-listbox>
        </div>

        <div class="form-row options-row" *ngIf="mode() === 'create'">
          <div class="option-group">
            <label class="option-label">优先级</label>
            <mat-select [formControl]="priorityControl" class="priority-select">
              <mat-option [value]="AnnotationPriority.LOW">
                <span class="priority-dot low"></span>
                低
              </mat-option>
              <mat-option [value]="AnnotationPriority.MEDIUM">
                <span class="priority-dot medium"></span>
                中
              </mat-option>
              <mat-option [value]="AnnotationPriority.HIGH">
                <span class="priority-dot high"></span>
                高
              </mat-option>
              <mat-option [value]="AnnotationPriority.URGENT">
                <span class="priority-dot urgent"></span>
                紧急
              </mat-option>
            </mat-select>
          </div>

          <div class="option-group">
            <label class="option-label">标签</label>
            <mat-form-field appearance="outline" class="tags-input">
              <mat-chip-listbox #tagList>
                <mat-chip
                  *ngFor="let tag of tags()"
                  [removable]="true"
                  (removed)="removeTag(tag)"
                >
                  {{ tag }}
                  <button matChipRemove>
                    <mat-icon>cancel</mat-icon>
                  </button>
                </mat-chip>
                <input
                  matChipInput
                  [formControl]="tagInputControl"
                  (matChipInputTokenEnd)="addTag($event)"
                  placeholder="添加标签..."
                />
              </mat-chip-listbox>
            </mat-form-field>
          </div>

          <div class="option-group" *ngIf="showAssignee()">
            <label class="option-label">指派给</label>
            <mat-select [formControl]="assigneeControl" class="assignee-select">
              <mat-option [value]="null">未指派</mat-option>
              <mat-option *ngFor="let user of assignableUsers()" [value]="user.id">
                {{ user.nickname }}
              </mat-option>
            </mat-select>
          </div>
        </div>

        <div class="editor-toolbar">
          <div class="toolbar-left">
            <button
              mat-icon-button
              type="button"
              (click)="insertMarkdown('**', '**')"
              matTooltip="粗体 (Ctrl+B)"
            >
              <mat-icon>format_bold</mat-icon>
            </button>
            <button
              mat-icon-button
              type="button"
              (click)="insertMarkdown('*', '*')"
              matTooltip="斜体 (Ctrl+I)"
            >
              <mat-icon>format_italic</mat-icon>
            </button>
            <button
              mat-icon-button
              type="button"
              (click)="insertMarkdown('~~', '~~')"
              matTooltip="删除线"
            >
              <mat-icon>format_strikethrough</mat-icon>
            </button>
            <span class="toolbar-divider"></span>
            <button
              mat-icon-button
              type="button"
              (click)="insertMarkdown('`', '`')"
              matTooltip="行内代码"
            >
              <mat-icon>code</mat-icon>
            </button>
            <button
              mat-icon-button
              type="button"
              (click)="insertMarkdown('\n```\n', '\n```\n')"
              matTooltip="代码块"
            >
              <mat-icon>data_object</mat-icon>
            </button>
            <span class="toolbar-divider"></span>
            <button
              mat-icon-button
              type="button"
              (click)="insertMarkdown('- [ ] ', '')"
              matTooltip="任务列表"
            >
              <mat-icon>check_box_outline_blank</mat-icon>
            </button>
            <span class="toolbar-divider"></span>
            <button
              mat-icon-button
              type="button"
              (click)="triggerMention()"
              matTooltip="提及用户 (@)"
            >
              <mat-icon>alternate_email</mat-icon>
            </button>
          </div>

          <div class="toolbar-right">
            <button
              mat-button
              type="button"
              (click)="onCancel()"
              [disabled]="isSubmitting()"
            >
              取消
            </button>
            <button
              mat-raised-button
              color="primary"
              type="button"
              (click)="onSubmit()"
              [disabled]="!canSubmit() || isSubmitting()"
            >
              <mat-spinner diameter="16" *ngIf="isSubmitting()"></mat-spinner>
              <ng-container *ngIf="!isSubmitting()">
                <mat-icon>{{ mode() === 'create' ? 'send' : 'reply' }}</mat-icon>
                {{ submitButtonText() }}
              </ng-container>
            </button>
          </div>
        </div>

        <div class="typing-indicator" *ngIf="typingUsers().length > 0">
          <mat-icon>edit_square</mat-icon>
          <span>
            {{ typingUsers().map(u => u.nickname).join('、') }}
            {{ typingUsers().length > 1 ? '正在' : '正在' }}输入...
          </span>
        </div>
      </div>

      <app-mention-dropdown
        #mentionDropdown
        [projectId]="projectId()"
        (userSelected)="onMentionUserSelected($event)"
      ></app-mention-dropdown>
    </div>
  `,
  styles: [
    `
      .annotation-editor {
        background: #fff;
        border-radius: 8px;
        padding: 16px;
        border: 1px solid #d4c9b5;
      }

      .editor-header {
        margin-bottom: 16px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e5dccb;

        .editor-title {
          margin: 0 0 8px 0;
          font-size: 16px;
          font-weight: 600;
          color: #5d4e37;
          font-family: 'Noto Serif SC', serif;
        }

        .selection-info {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: #f5f0e6;
          border-radius: 6px;
          font-size: 13px;
          color: #6b5d4a;

          mat-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
            color: #c84c3b;
          }

          .selection-text {
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          button {
            margin-left: 8px;
          }
        }
      }

      .editor-form {
        .form-row {
          margin-bottom: 16px;
        }

        .title-input,
        .content-input {
          width: 100%;
        }

        .options-row {
          display: flex;
          gap: 16px;
          flex-wrap: wrap;

          .option-group {
            flex: 1;
            min-width: 150px;

            .option-label {
              display: block;
              font-size: 12px;
              font-weight: 500;
              color: #6b5d4a;
              margin-bottom: 6px;
            }

            .priority-select,
            .assignee-select,
            .tags-input {
              width: 100%;
            }
          }
        }

        .priority-dot {
          display: inline-block;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          margin-right: 8px;

          &.low {
            background: #4a7c59;
          }
          &.medium {
            background: #c89b3b;
          }
          &.high {
            background: #e07a3b;
          }
          &.urgent {
            background: #c84c3b;
          }
        }

        .mention-preview {
          margin-bottom: 16px;

          .mention-label {
            font-size: 12px;
            color: #6b5d4a;
            margin-right: 8px;
          }
        }

        .mention-chip-text {
          color: #c84c3b;
        }

        .editor-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-top: 12px;
          border-top: 1px solid #e5dccb;

          .toolbar-left {
            display: flex;
            align-items: center;
            gap: 4px;

            button {
              color: #6b5d4a;

              &:hover {
                color: #c84c3b;
                background: #f5f0e6;
              }
            }

            .toolbar-divider {
              width: 1px;
              height: 24px;
              background: #e5dccb;
              margin: 0 8px;
            }
          }

          .toolbar-right {
            display: flex;
            gap: 8px;

            button {
              min-width: 80px;
            }

            mat-spinner {
              display: inline-block;
              vertical-align: middle;
              margin-right: 8px;
            }
          }
        }

        .typing-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 6px 12px;
          background: #f0f7f0;
          border-radius: 4px;
          font-size: 12px;
          color: #4a7c59;

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
            animation: pulse 1.5s infinite;
          }

          @keyframes pulse {
            0%,
            100% {
              opacity: 1;
            }
            50% {
              opacity: 0.5;
            }
          }
        }
      }
    `
  ]
})
export class AnnotationEditorComponent implements OnInit, OnDestroy {
  private annotationService = inject(AnnotationService);
  private realtimeService = inject(RealtimeAnnotationService);
  private authService = inject(AuthService);

  @Input() mode = signal<'create' | 'reply'>('create');
  @Input() projectId = signal<string>('');
  @Input() documentId = signal<string>('');
  @Input() annotationId = signal<string>('');
  @Input() selection = signal<TextSelection | null>(null);
  @Input() placeholder = signal('请输入批注内容...');
  @Input() showAssignee = signal(true);

  @Output() submit = new EventEmitter<
    CreateAnnotationRequest | CreateAnnotationReplyRequest
  >();
  @Output() cancel = new EventEmitter<void>();
  @Output() submitSuccess = new EventEmitter<any>();

  @ViewChild('contentTextarea') contentTextarea!: ElementRef<HTMLTextAreaElement>;
  @ViewChild('mentionDropdown') mentionDropdown!: MentionDropdownComponent;

  titleControl = new FormControl('');
  contentControl = new FormControl('', [Validators.required, Validators.maxLength(2000)]);
  priorityControl = new FormControl(AnnotationPriority.MEDIUM);
  assigneeControl = new FormControl<string | null>(null);
  tagInputControl = new FormControl('');

  isSubmitting = signal(false);
  mentions = signal<MentionUser[]>([]);
  tags = signal<string[]>([]);
  assignableUsers = signal<any[]>([]);
  typingUsers = signal<any[]>([]);

  AnnotationPriority = AnnotationPriority;

  private typingSubscription?: Subscription;
  private typingSubject = new Subject<void>();
  private typingTimeout?: any;

  canSubmit = computed(() => {
    if (this.mode() === 'create') {
      return this.contentControl.valid && !!this.selection();
    }
    return this.contentControl.valid;
  });

  submitButtonText = computed(() => {
    return this.mode() === 'create' ? '提交批注' : '发送回复';
  });

  ngOnInit(): void {
    this.loadAssignableUsers();
    this.setupTypingIndicator();
    this.setupContentDebounce();
  }

  ngOnDestroy(): void {
    this.typingSubscription?.unsubscribe();
    this.typingSubject.complete();
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
  }

  /**
   * 加载可指派用户
   */
  private loadAssignableUsers(): void {
    if (this.projectId()) {
      this.annotationService.searchMentionUsers('', this.projectId()).subscribe({
        next: (users) => {
          this.assignableUsers.set(users);
        },
        error: () => {
          this.assignableUsers.set([]);
        }
      });
    }
  }

  /**
   * 设置输入状态指示器
   */
  private setupTypingIndicator(): void {
    if (this.mode() === 'reply' && this.annotationId()) {
      this.typingSubscription = this.realtimeService
        .onUserTyping(this.annotationId())
        .subscribe((event) => {
          if (event.userId !== this.authService.currentUser()?.id) {
            this.updateTypingUsers(event);
          }
        });
    }
  }

  /**
   * 设置内容输入防抖
   */
  private setupContentDebounce(): void {
    this.contentControl.valueChanges.pipe(debounceTime(500)).subscribe(() => {
      this.sendTypingStatus(true);
    });
  }

  /**
   * 发送正在输入状态
   */
  private sendTypingStatus(isTyping: boolean): void {
    if (this.mode() === 'reply' && this.annotationId()) {
      this.realtimeService.sendTyping(this.annotationId(), isTyping);

      if (this.typingTimeout) {
        clearTimeout(this.typingTimeout);
      }

      if (isTyping) {
        this.typingTimeout = setTimeout(() => {
          this.realtimeService.sendTyping(this.annotationId(), false);
        }, 2000);
      }
    }
  }

  /**
   * 更新正在输入的用户列表
   */
  private updateTypingUsers(event: {
    userId: string;
    annotationId?: string;
    isTyping: boolean;
  }): void {
    const currentUsers = this.typingUsers();
    if (event.isTyping) {
      const user = this.assignableUsers().find((u) => u.id === event.userId);
      if (user && !currentUsers.find((u) => u.id === event.userId)) {
        this.typingUsers.set([...currentUsers, user]);
      }
    } else {
      this.typingUsers.set(currentUsers.filter((u) => u.id !== event.userId));
    }
  }

  /**
   * 内容输入处理
   */
  onContentInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.checkForMentionTrigger(target);
    this.sendTypingStatus(true);
  }

  /**
   * 检查@触发
   */
  private checkForMentionTrigger(textarea: HTMLTextAreaElement): void {
    const cursorPos = textarea.selectionStart;
    const text = textarea.value.substring(0, cursorPos);
    const lastAtIndex = text.lastIndexOf('@');

    if (lastAtIndex !== -1) {
      const textAfterAt = text.substring(lastAtIndex + 1);
      if (!textAfterAt.includes(' ') && !textAfterAt.includes('\n')) {
        const rect = this.getCaretCoordinates(textarea, cursorPos);
        this.mentionDropdown.open(rect.left, rect.bottom + 10, textAfterAt);
        return;
      }
    }
    this.mentionDropdown.close();
  }

  /**
   * 获取光标坐标
   */
  private getCaretCoordinates(textarea: HTMLTextAreaElement, position: number): DOMRect {
    const div = document.createElement('div');
    const computed = window.getComputedStyle(textarea);

    div.style.position = 'absolute';
    div.style.visibility = 'hidden';
    div.style.whiteSpace = 'pre-wrap';
    div.style.wordWrap = 'break-word';
    div.style.overflow = 'hidden';
    div.style.fontFamily = computed.fontFamily;
    div.style.fontSize = computed.fontSize;
    div.style.lineHeight = computed.lineHeight;
    div.style.padding = computed.padding;
    div.style.width = textarea.offsetWidth + 'px';

    const textBefore = textarea.value.substring(0, position);
    const textAfter = textarea.value.substring(position);

    div.innerHTML =
      this.escapeHtml(textBefore) + '<span id="caret"></span>' + this.escapeHtml(textAfter);

    document.body.appendChild(div);

    const caret = div.querySelector('#caret') as HTMLElement;
    const rect = caret.getBoundingClientRect();

    document.body.removeChild(div);

    return rect;
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
   * 键盘事件处理
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.ctrlKey || event.metaKey) {
      switch (event.key.toLowerCase()) {
        case 'b':
          event.preventDefault();
          this.insertMarkdown('**', '**');
          break;
        case 'i':
          event.preventDefault();
          this.insertMarkdown('*', '*');
          break;
        case 'enter':
          event.preventDefault();
          if (this.canSubmit()) {
            this.onSubmit();
          }
          break;
      }
    }

    if (event.key === 'Escape') {
      this.mentionDropdown.close();
    }
  }

  /**
   * 编辑器点击处理
   */
  onEditorClick(event: MouseEvent): void {
    const target = event.target as HTMLTextAreaElement;
    this.checkForMentionTrigger(target);
  }

  /**
   * 触发@提及
   */
  triggerMention(): void {
    const textarea = this.contentTextarea.nativeElement;
    const cursorPos = textarea.selectionStart;
    const text = textarea.value;

    const newText = text.substring(0, cursorPos) + '@' + text.substring(cursorPos);
    this.contentControl.setValue(newText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(cursorPos + 1, cursorPos + 1);
      const rect = this.getCaretCoordinates(textarea, cursorPos + 1);
      this.mentionDropdown.open(rect.left, rect.bottom + 10, '');
    }, 0);
  }

  /**
   * 提及用户选择处理
   */
  onMentionUserSelected(user: MentionUser): void {
    const textarea = this.contentTextarea.nativeElement;
    const cursorPos = textarea.selectionStart;
    const text = textarea.value;

    const lastAtIndex = text.lastIndexOf('@', cursorPos - 1);
    if (lastAtIndex !== -1) {
      const mentionText = `@${user.nickname} `;
      const newText =
        text.substring(0, lastAtIndex) + mentionText + text.substring(cursorPos);

      user.offset = lastAtIndex;
      user.length = mentionText.length;

      this.contentControl.setValue(newText);
      this.mentions.set([...this.mentions(), user]);

      setTimeout(() => {
        const newCursorPos = lastAtIndex + mentionText.length;
        textarea.focus();
        textarea.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    }
  }

  /**
   * 移除提及用户
   */
  removeMention(mention: MentionUser): void {
    this.mentions.set(this.mentions().filter((m) => m.id !== mention.id));
  }

  /**
   * 插入Markdown语法
   */
  insertMarkdown(before: string, after: string): void {
    const textarea = this.contentTextarea.nativeElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const selectedText = text.substring(start, end);

    const newText =
      text.substring(0, start) +
      before +
      selectedText +
      after +
      text.substring(end);

    this.contentControl.setValue(newText);

    setTimeout(() => {
      const newStart = start + before.length;
      const newEnd = end + before.length;
      textarea.focus();
      textarea.setSelectionRange(newStart, newEnd);
    }, 0);
  }

  /**
   * 添加标签
   */
  addTag(event: any): void {
    const input = event.input;
    const value = event.value.trim();

    if (value && !this.tags().includes(value)) {
      this.tags.set([...this.tags(), value]);
    }

    if (input) {
      input.value = '';
    }
    this.tagInputControl.setValue('');
  }

  /**
   * 移除标签
   */
  removeTag(tag: string): void {
    this.tags.set(this.tags().filter((t) => t !== tag));
  }

  /**
   * 清除选区
   */
  clearSelection(): void {
    this.selection.set(null);
  }

  /**
   * 提交处理
   */
  onSubmit(): void {
    if (!this.canSubmit()) return;

    this.isSubmitting.set(true);

    const content = this.contentControl.value?.trim() || '';
    const mentions = this.mentions();

    if (this.mode() === 'create') {
      const request: CreateAnnotationRequest = {
        projectId: this.projectId(),
        documentId: this.documentId(),
        title: this.titleControl.value?.trim() || undefined,
        content,
        selection: this.selection()!,
        priority: this.priorityControl.value!,
        tags: this.tags(),
        mentions,
        assigneeId: this.assigneeControl.value || undefined
      };
      this.submit.emit(request);
      this.performCreate(request);
    } else {
      const request: CreateAnnotationReplyRequest = {
        annotationId: this.annotationId(),
        content,
        mentions
      };
      this.submit.emit(request);
      this.performReply(request);
    }
  }

  /**
   * 执行创建批注
   */
  private performCreate(request: CreateAnnotationRequest): void {
    this.annotationService.createAnnotation(request).subscribe({
      next: (annotation) => {
        this.isSubmitting.set(false);
        this.realtimeService.sendAnnotationCreated(annotation);
        this.submitSuccess.emit(annotation);
        this.resetForm();
      },
      error: () => {
        this.isSubmitting.set(false);
      }
    });
  }

  /**
   * 执行创建回复
   */
  private performReply(request: CreateAnnotationReplyRequest): void {
    this.annotationService.createReply(request).subscribe({
      next: (reply) => {
        this.isSubmitting.set(false);
        this.realtimeService.sendReplyCreated(
          request.annotationId,
          reply,
          this.projectId(),
          this.documentId()
        );
        this.submitSuccess.emit(reply);
        this.resetForm();
      },
      error: () => {
        this.isSubmitting.set(false);
      }
    });
  }

  /**
   * 取消处理
   */
  onCancel(): void {
    this.cancel.emit();
    this.resetForm();
  }

  /**
   * 重置表单
   */
  private resetForm(): void {
    this.titleControl.reset('');
    this.contentControl.reset('');
    this.priorityControl.setValue(AnnotationPriority.MEDIUM);
    this.assigneeControl.reset(null);
    this.tagInputControl.reset('');
    this.mentions.set([]);
    this.tags.set([]);
    this.sendTypingStatus(false);
  }

  /**
   * 截断文本
   */
  truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

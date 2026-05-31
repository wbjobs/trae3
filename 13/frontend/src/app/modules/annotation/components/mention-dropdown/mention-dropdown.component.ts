// 提及用户下拉组件 - @时弹出用户列表

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  HostListener,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatListModule } from '@angular/material/list';
import { MatAvatar } from '@angular/material/core';
import { Subject, Subscription, debounceTime, switchMap, of, catchError } from 'rxjs';
import { AnnotationService } from '../../services/annotation.service';
import { MentionUser } from '@core/models/annotation.model';

@Component({
  selector: 'app-mention-dropdown',
  standalone: true,
  imports: [CommonModule, MatListModule, MatAvatar],
  template: `
    <div
      class="mention-dropdown"
      *ngIf="isOpen()"
      [style.top.px]="position().y"
      [style.left.px]="position().x"
      @fadeIn
    >
      <div class="dropdown-header">
        <span class="header-title">选择用户</span>
        <span class="header-hint">输入关键词搜索</span>
      </div>

      <div class="search-input-wrapper">
        <input
          type="text"
          class="search-input"
          [value]="searchText()"
          (input)="onSearchInput($event)"
          placeholder="搜索用户..."
          autocomplete="off"
        />
      </div>

      <mat-list class="user-list" *ngIf="filteredUsers().length > 0; else noResults">
        <mat-list-item
          class="user-item"
          *ngFor="let user of filteredUsers(); let i = index"
          [class.selected]="selectedIndex() === i"
          (click)="selectUser(user)"
          (mouseenter)="selectedIndex.set(i)"
        >
          <div class="user-avatar" matListItemAvatar>
            <img *ngIf="user.avatar" [src]="user.avatar" [alt]="user.nickname" />
            <span *ngIf="!user.avatar" class="avatar-placeholder">
              {{ user.nickname.charAt(0) }}
            </span>
          </div>
          <div class="user-info" matListItemTitle>
            <span class="user-nickname">{{ user.nickname }}</span>
            <span class="user-username">@{{ user.username }}</span>
          </div>
        </mat-list-item>
      </mat-list>

      <ng-template #noResults>
        <div class="no-results" *ngIf="!isLoading()">
          <mat-icon>person_off</mat-icon>
          <span>未找到匹配的用户</span>
        </div>
        <div class="loading" *ngIf="isLoading()">
          <mat-spinner diameter="20"></mat-spinner>
          <span>搜索中...</span>
        </div>
      </ng-template>

      <div class="dropdown-footer">
        <span class="shortcut-hint">
          <kbd>↑</kbd><kbd>↓</kbd> 导航 &nbsp;
          <kbd>Enter</kbd> 选择 &nbsp;
          <kbd>Esc</kbd> 关闭
        </span>
      </div>
    </div>
  `,
  styles: [
    `
      .mention-dropdown {
        position: fixed;
        z-index: 1000;
        min-width: 280px;
        max-height: 360px;
        background: #fff;
        border: 1px solid #d4c9b5;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(93, 78, 55, 0.15);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }

      .dropdown-header {
        padding: 12px 16px;
        border-bottom: 1px solid #e5dccb;
        background: #faf7f0;

        .header-title {
          display: block;
          font-size: 14px;
          font-weight: 600;
          color: #5d4e37;
          font-family: 'Noto Serif SC', serif;
        }

        .header-hint {
          display: block;
          font-size: 12px;
          color: #9b8f7a;
          margin-top: 2px;
        }
      }

      .search-input-wrapper {
        padding: 12px 16px;
        border-bottom: 1px solid #e5dccb;

        .search-input {
          width: 100%;
          padding: 8px 12px;
          border: 1px solid #d4c9b5;
          border-radius: 6px;
          font-size: 14px;
          color: #2c2416;
          background: #fff;
          outline: none;
          transition: border-color 0.2s;

          &:focus {
            border-color: #c84c3b;
          }

          &::placeholder {
            color: #9b8f7a;
          }
        }
      }

      .user-list {
        flex: 1;
        overflow-y: auto;
        padding: 4px 0;
      }

      .user-item {
        cursor: pointer;
        padding: 8px 16px;
        transition: background-color 0.15s;

        &:hover,
        &.selected {
          background: #f5f0e6;
        }

        .user-avatar {
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

        .user-info {
          margin-left: 12px;

          .user-nickname {
            display: block;
            font-size: 14px;
            font-weight: 500;
            color: #2c2416;
          }

          .user-username {
            display: block;
            font-size: 12px;
            color: #9b8f7a;
            margin-top: 2px;
          }
        }
      }

      .no-results,
      .loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px 16px;
        color: #9b8f7a;

        mat-icon {
          font-size: 32px;
          width: 32px;
          height: 32px;
          margin-bottom: 8px;
        }

        span {
          font-size: 13px;
        }
      }

      .dropdown-footer {
        padding: 8px 16px;
        border-top: 1px solid #e5dccb;
        background: #faf7f0;

        .shortcut-hint {
          font-size: 11px;
          color: #9b8f7a;

          kbd {
            display: inline-block;
            padding: 2px 6px;
            background: #fff;
            border: 1px solid #d4c9b5;
            border-radius: 3px;
            font-family: monospace;
            font-size: 10px;
            margin: 0 2px;
          }
        }
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `
  ]
})
export class MentionDropdownComponent implements OnInit, OnDestroy {
  private annotationService = inject(AnnotationService);

  @Input() projectId?: string;
  @Input() position = signal({ x: 0, y: 0 });
  @Input() triggerWord = signal('');

  @Output() userSelected = new EventEmitter<MentionUser>();
  @Output() closed = new EventEmitter<void>();

  isOpen = signal(false);
  isLoading = signal(false);
  searchText = signal('');
  selectedIndex = signal(0);

  private searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;
  private allUsers: any[] = [];

  filteredUsers = computed(() => {
    const text = this.searchText().toLowerCase().trim();
    if (!text) {
      return this.allUsers.slice(0, 10);
    }
    return this.allUsers
      .filter(
        (user) =>
          user.nickname.toLowerCase().includes(text) ||
          user.username.toLowerCase().includes(text)
      )
      .slice(0, 10);
  });

  ngOnInit(): void {
    this.setupSearchDebounce();
    this.loadUsers();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.searchSubject.complete();
  }

  /**
   * 设置搜索防抖
   */
  private setupSearchDebounce(): void {
    this.searchSubscription = this.searchSubject
      .pipe(
        debounceTime(300),
        switchMap((keyword) => {
          if (!keyword.trim()) {
            return of(this.allUsers);
          }
          this.isLoading.set(true);
          return this.annotationService
            .searchMentionUsers(keyword, this.projectId)
            .pipe(
              catchError(() => of([])),
              switchMap((users) => {
                this.allUsers = users;
                return of(users);
              })
            );
        })
      )
      .subscribe({
        next: () => {
          this.isLoading.set(false);
          this.selectedIndex.set(0);
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  /**
   * 加载用户列表
   */
  private loadUsers(): void {
    this.isLoading.set(true);
    this.annotationService
      .searchMentionUsers('', this.projectId)
      .pipe(catchError(() => of([])))
      .subscribe((users) => {
        this.allUsers = users;
        this.isLoading.set(false);
      });
  }

  /**
   * 打开下拉框
   */
  open(x: number, y: number, triggerWord: string = ''): void {
    this.position.set({ x, y });
    this.triggerWord.set(triggerWord);
    this.searchText.set(triggerWord);
    this.selectedIndex.set(0);
    this.isOpen.set(true);
    this.searchSubject.next(triggerWord);
  }

  /**
   * 关闭下拉框
   */
  close(): void {
    this.isOpen.set(false);
    this.searchText.set('');
    this.closed.emit();
  }

  /**
   * 搜索输入处理
   */
  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchText.set(target.value);
    this.searchSubject.next(target.value);
  }

  /**
   * 选择用户
   */
  selectUser(user: any): void {
    const mentionUser: MentionUser = {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      avatar: user.avatar,
      offset: 0,
      length: 0
    };
    this.userSelected.emit(mentionUser);
    this.close();
  }

  /**
   * 键盘导航处理
   */
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent): void {
    if (!this.isOpen()) return;

    const users = this.filteredUsers();

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (this.selectedIndex() < users.length - 1) {
          this.selectedIndex.set(this.selectedIndex() + 1);
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (this.selectedIndex() > 0) {
          this.selectedIndex.set(this.selectedIndex() - 1);
        }
        break;
      case 'Enter':
        event.preventDefault();
        if (users.length > 0) {
          this.selectUser(users[this.selectedIndex()]);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.close();
        break;
      case 'Tab':
        event.preventDefault();
        if (users.length > 0) {
          this.selectUser(users[this.selectedIndex()]);
        }
        break;
    }
  }

  /**
   * 点击外部关闭
   */
  @HostListener('document:click', ['$event'])
  handleClickOutside(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.mention-dropdown')) {
      this.close();
    }
  }
}

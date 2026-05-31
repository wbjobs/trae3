// 搜索结果项组件 - 展示单个搜索结果，高亮显示关键词

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { SearchResult, SearchScope } from '../../../../core/models/search.model';
import { SearchService } from '../../services/search.service';

@Component({
  selector: 'app-search-result-item',
  standalone: true,
  imports: [
    CommonModule,
    DatePipe,
    MatButtonModule,
    MatIconModule,
    MatCardModule,
    MatChipsModule,
    MatTooltipModule
  ],
  template: `
    <mat-card
      class="search-result-card ancient-card"
      [class.highlighted]="isHighlighted()"
      (click)="onItemClick()"
    >
      <mat-card-content>
        <div class="result-header">
          <div class="result-type">
            <mat-icon class="type-icon">{{ getTypeIcon() }}</mat-icon>
            <span class="type-label">{{ getTypeLabel() }}</span>
          </div>

          <div class="result-score" *ngIf="showScore()">
            <mat-icon>star</mat-icon>
            <span>{{ formatScore(result().score) }}</span>
          </div>
        </div>

        <h3 class="result-title" [innerHTML]="highlightedTitle()"></h3>

        <div class="result-meta">
          <span class="meta-item" *ngIf="result().projectName">
            <mat-icon>folder</mat-icon>
            {{ result().projectName }}
          </span>
          <span class="meta-item" *ngIf="result().documentTitle">
            <mat-icon>description</mat-icon>
            {{ result().documentTitle }}
          </span>
          <span class="meta-item" *ngIf="result().pageNumber">
            <mat-icon>menu_book</mat-icon>
            第 {{ result().pageNumber }} 页
          </span>
          <span class="meta-item" *ngIf="result().annotationCount">
            <mat-icon>comment</mat-icon>
            {{ result().annotationCount }} 条批注
          </span>
          <span class="meta-item" *ngIf="result().collationVersion">
            <mat-icon>edit_note</mat-icon>
            v{{ result().collationVersion }}
          </span>
        </div>

        <div class="result-content" [innerHTML]="highlightedContent()"></div>

        <div class="result-highlights" *ngIf="hasHighlights()">
          <div
            class="highlight-fragment"
            *ngFor="let fragment of getHighlightFragments(); let i = index"
            [innerHTML]="fragment"
          ></div>
        </div>

        <div class="result-footer">
          <div class="result-tags" *ngIf="result().metadata?.tags?.length">
            <mat-chip
              *ngFor="let tag of result().metadata.tags"
              class="result-tag"
            >
              {{ tag }}
            </mat-chip>
          </div>

          <div class="result-date">
            <mat-icon>schedule</mat-icon>
            <span>{{ result().updatedAt | date: 'yyyy-MM-dd HH:mm' }}</span>
          </div>
        </div>
      </mat-card-content>

      <mat-card-actions *ngIf="showActions()">
        <button
          mat-button
          (click)="onViewClick($event)"
          matTooltip="查看详情"
        >
          <mat-icon>visibility</mat-icon>
          查看
        </button>
        <button
          mat-button
          (click)="onNavigateClick($event)"
          matTooltip="定位到原文"
          *ngIf="canNavigate()"
        >
          <mat-icon>open_in_new</mat-icon>
          定位
        </button>
        <button
          mat-button
          (click)="onSaveClick($event)"
          matTooltip="保存搜索"
        >
          <mat-icon>bookmark_border</mat-icon>
          保存
        </button>
      </mat-card-actions>
    </mat-card>
  `,
  styles: [`
    .search-result-card {
      cursor: pointer;
      transition: all 0.25s ease-in-out;
      margin-bottom: 16px;
      border-left: 4px solid transparent;

      &:hover {
        box-shadow: 0 4px 16px rgba(93, 78, 55, 0.2);
        transform: translateY(-2px);
      }

      &.highlighted {
        border-left-color: #c84c3b;
        background: linear-gradient(to right, rgba(200, 76, 59, 0.05), transparent);
      }

      .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;

        .result-type {
          display: flex;
          align-items: center;
          gap: 6px;

          .type-icon {
            font-size: 18px;
            width: 18px;
            height: 18px;
            color: #c84c3b;
          }

          .type-label {
            font-size: 12px;
            color: #c84c3b;
            font-weight: 500;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }
        }

        .result-score {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #c89b3b;

          mat-icon {
            font-size: 14px;
            width: 14px;
            height: 14px;
          }
        }
      }

      .result-title {
        margin: 0 0 12px 0;
        font-size: 18px;
        font-weight: 600;
        color: #2c2416;
        font-family: 'Noto Serif SC', serif;
        line-height: 1.5;
        word-break: break-word;

        ::ng-deep mark {
          background: rgba(200, 76, 59, 0.25);
          color: #c84c3b;
          padding: 0 2px;
          border-radius: 2px;
          font-weight: 600;
        }
      }

      .result-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid #e5dccb;

        .meta-item {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 13px;
          color: #6b5d4a;

          mat-icon {
            font-size: 14px;
            width: 14px;
            height: 14px;
            color: #8b7d65;
          }
        }
      }

      .result-content {
        font-size: 14px;
        line-height: 1.8;
        color: #2c2416;
        margin-bottom: 12px;
        max-height: 120px;
        overflow: hidden;
        position: relative;

        &::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          height: 40px;
          background: linear-gradient(to bottom, transparent, #faf7f0);
        }

        ::ng-deep mark {
          background: rgba(200, 76, 59, 0.25);
          color: #c84c3b;
          padding: 0 2px;
          border-radius: 2px;
          font-weight: 600;
        }
      }

      .result-highlights {
        margin-bottom: 12px;

        .highlight-fragment {
          font-size: 13px;
          line-height: 1.7;
          color: #5d4e37;
          padding: 8px 12px;
          margin-bottom: 8px;
          background: #fff9f5;
          border-left: 3px solid #c84c3b;
          border-radius: 0 4px 4px 0;

          &:last-child {
            margin-bottom: 0;
          }

          ::ng-deep mark {
            background: rgba(200, 76, 59, 0.3);
            color: #c84c3b;
            padding: 0 2px;
            border-radius: 2px;
            font-weight: 600;
          }

          &::before {
            content: '...';
            color: #9b8f7a;
            margin-right: 4px;
          }

          &::after {
            content: '...';
            color: #9b8f7a;
            margin-left: 4px;
          }
        }
      }

      .result-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;

        .result-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;

          .result-tag {
            font-size: 11px;
            padding: 2px 8px;
            background: #f5f0e6;
            color: #6b5d4a;
          }
        }

        .result-date {
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 12px;
          color: #9b8f7a;

          mat-icon {
            font-size: 12px;
            width: 12px;
            height: 12px;
          }
        }
      }

      mat-card-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        padding: 12px 16px 16px;
        border-top: 1px solid #e5dccb;
        margin: 0;

        button {
          font-size: 13px;

          mat-icon {
            font-size: 16px;
            width: 16px;
            height: 16px;
            margin-right: 4px;
          }
        }
      }
    }
  `]
})
export class SearchResultItemComponent implements OnInit {
  private searchService = inject(SearchService);

  @Input({ required: true }) result!: () => SearchResult;
  @Input() searchQuery = '';
  @Input() isHighlighted = signal(false);
  @Input() showScore = signal(true);
  @Input() showActions = signal(true);

  @Output() itemClick = new EventEmitter<SearchResult>();
  @Output() viewClick = new EventEmitter<SearchResult>();
  @Output() navigateClick = new EventEmitter<SearchResult>();
  @Output() saveClick = new EventEmitter<SearchResult>();

  readonly highlightedTitle = computed(() => {
    const title = this.result().title;
    if (!this.searchQuery) return title;
    return this.searchService.highlightText(title, this.searchQuery);
  });

  readonly highlightedContent = computed(() => {
    const content = this.result().content;
    if (!this.searchQuery) return content;
    return this.searchService.highlightText(content, this.searchQuery);
  });

  ngOnInit(): void {}

  getTypeIcon(): string {
    return this.searchService.getScopeIcon(this.result().type);
  }

  getTypeLabel(): string {
    return this.searchService.getScopeLabel(this.result().type);
  }

  formatScore(score: number): string {
    return (score * 100).toFixed(1) + '%';
  }

  hasHighlights(): boolean {
    const highlights = this.result().highlights;
    return highlights && Object.keys(highlights).length > 0;
  }

  getHighlightFragments(): string[] {
    const highlights = this.result().highlights;
    if (!highlights) return [];

    const fragments: string[] = [];
    Object.values(highlights).forEach((fieldFragments) => {
      if (Array.isArray(fieldFragments)) {
        fragments.push(...fieldFragments);
      }
    });

    return fragments.slice(0, 3);
  }

  canNavigate(): boolean {
    return this.result().type === SearchScope.PAGE ||
           this.result().type === SearchScope.ANNOTATION ||
           this.result().type === SearchScope.COLLATION;
  }

  onItemClick(): void {
    this.itemClick.emit(this.result());
  }

  onViewClick(event: MouseEvent): void {
    event.stopPropagation();
    this.viewClick.emit(this.result());
  }

  onNavigateClick(event: MouseEvent): void {
    event.stopPropagation();
    this.navigateClick.emit(this.result());
  }

  onSaveClick(event: MouseEvent): void {
    event.stopPropagation();
    this.saveClick.emit(this.result());
  }
}

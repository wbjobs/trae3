// 检索页面组件 - 包含搜索框、筛选侧边栏、结果列表

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
import {
  Subject,
  takeUntil,
  debounceTime,
  debounce,
  switchMap,
  of,
  catchError,
  filter
} from 'rxjs';
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
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { SearchService } from '../../services/search.service';
import { SearchResultItemComponent } from '../../components/search-result-item/search-result-item.component';
import {
  SearchRequest,
  SearchResponse,
  SearchResult,
  SearchScope,
  SearchSuggestion,
  FacetResult,
  FacetBucket,
  SearchHistory,
  SavedSearch,
  SearchCondition,
  SearchOperator
} from '../../../../core/models/search.model';

@Component({
  selector: 'app-search-page',
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
    MatCheckboxModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    MatAutocompleteModule,
    SearchResultItemComponent
  ],
  template: `
    <div class="search-page">
      <mat-toolbar class="page-toolbar">
        <div class="toolbar-left">
          <button mat-icon-button (click)="goBack()">
            <mat-icon>arrow_back</mat-icon>
          </button>
          <h1 class="page-title">
            <mat-icon class="title-icon">search</mat-icon>
            全文检索
          </h1>
        </div>

        <div class="toolbar-center">
          <div class="search-input-wrapper">
            <mat-form-field appearance="outline" class="search-input">
              <mat-label>搜索古籍内容</mat-label>
              <input
                matInput
                [formControl]="searchControl"
                [matAutocomplete]="auto"
                placeholder="输入关键词搜索..."
                (keyup.enter)="performSearch()"
              />
              <mat-icon matPrefix>search</mat-icon>
              <button
                mat-icon-button
                matSuffix
                *ngIf="searchControl.value"
                (click)="clearSearch()"
                matTooltip="清除"
              >
                <mat-icon>close</mat-icon>
              </button>
              <mat-spinner
                *ngIf="isSuggestLoading()"
                matSuffix
                diameter="16"
              ></mat-spinner>
            </mat-form-field>

            <mat-autocomplete
              #auto="matAutocomplete"
              (optionSelected)="onSuggestionSelected($event)"
            >
              <mat-option
                *ngFor="let suggestion of suggestions()"
                [value]="suggestion.text"
              >
                <div class="suggestion-item">
                  <mat-icon>{{ getSuggestionIcon(suggestion.type) }}</mat-icon>
                  <span [innerHTML]="highlightSuggestion(suggestion.text)"></span>
                  <span class="suggestion-count" *ngIf="suggestion.count">
                    {{ suggestion.count }} 条结果
                  </span>
                </div>
              </mat-option>
            </mat-autocomplete>
          </div>
        </div>

        <div class="toolbar-right">
          <button
            mat-button
            [matMenuTriggerFor]="scopeMenu"
            class="scope-button"
          >
            <mat-icon>tune</mat-icon>
            {{ getCurrentScopeLabel() }}
          </button>

          <mat-menu #scopeMenu="matMenu">
            <button
              mat-menu-item
              *ngFor="let scope of scopeOptions"
              (click)="setScope(scope.value)"
              [class.active]="currentScope() === scope.value"
            >
              <mat-icon>{{ scope.icon }}</mat-icon>
              <span>{{ scope.label }}</span>
              <mat-icon *ngIf="currentScope() === scope.value">check</mat-icon>
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
            mat-raised-button
            color="primary"
            (click)="performSearch()"
            [disabled]="!searchControl.value || isLoading()"
          >
            <mat-icon [class.spinning]="isLoading()">search</mat-icon>
            搜索
          </button>
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
                <h4>搜索范围</h4>
                <div class="filter-options">
                  <mat-checkbox
                    *ngFor="let scope of scopeOptions"
                    [checked]="isScopeChecked(scope.value)"
                    (change)="toggleScope(scope.value)"
                  >
                    {{ scope.label }}
                  </mat-checkbox>
                </div>
              </div>

              <div class="filter-section" *ngIf="facets().length > 0">
                <h4>分面筛选</h4>
                <div
                  class="facet-group"
                  *ngFor="let facet of facets()"
                >
                  <h5>{{ facet.name }}</h5>
                  <div
                    class="facet-options"
                  >
                    <mat-checkbox
                      *ngFor="let bucket of facet.buckets"
                      [checked]="bucket.selected"
                      (change)="toggleFacet(facet.field, bucket)"
                    >
                      <span class="facet-value">{{ bucket.value }}</span>
                      <span class="facet-count">({{ bucket.count }})</span>
                    </mat-checkbox>
                  </div>
                </div>
              </div>

              <div class="filter-section">
                <h4>日期范围</h4>
                <div class="date-range">
                  <mat-form-field appearance="outline" class="date-input">
                    <mat-label>开始日期</mat-label>
                    <input
                      matInput
                      [matDatepicker]="startPicker"
                      [formControl]="startDateFilter"
                      type="date"
                    />
                  </mat-form-field>
                  <span class="date-separator">-</span>
                  <mat-form-field appearance="outline" class="date-input">
                    <mat-label>结束日期</mat-label>
                    <input
                      matInput
                      [matDatepicker]="endPicker"
                      [formControl]="endDateFilter"
                      type="date"
                    />
                  </mat-form-field>
                </div>
              </div>

              <div class="filter-section">
                <h4>排序方式</h4>
                <mat-form-field appearance="outline" class="sort-select">
                  <mat-select [formControl]="sortControl">
                    <mat-option value="relevance">相关度</mat-option>
                    <mat-option value="createdAt-desc">最新创建</mat-option>
                    <mat-option value="createdAt-asc">最早创建</mat-option>
                    <mat-option value="updatedAt-desc">最新更新</mat-option>
                    <mat-option value="updatedAt-asc">最早更新</mat-option>
                  </mat-select>
                </mat-form-field>
              </div>

              <div class="filter-actions">
                <button mat-button (click)="clearFilters()">
                  <mat-icon>filter_alt_off</mat-icon>
                  清除筛选
                </button>
                <button mat-raised-button color="primary" (click)="performSearch()">
                  <mat-icon>search</mat-icon>
                  应用筛选
                </button>
              </div>
              </div>
          </mat-sidenav>

          <mat-sidenav-content>
            <div class="results-container">
              <div class="results-header" *ngIf="searchResponse()">
                <div class="results-info">
                  <span class="results-count">
                    找到 <strong>{{ searchResponse()?.total || 0 }}</strong> 条结果
                  </span>
                  <span class="results-time" *ngIf="searchResponse()?.took">
                    耗时 {{ formatTook() }} 毫秒
                  </span>
                </div>

                <div class="results-actions">
                  <button
                    mat-button
                    [matMenuTriggerFor]="viewMenu"
                  >
                    <mat-icon>view_module</mat-icon>
                    {{ viewMode() === 'list' ? '列表视图' : '卡片视图' }}
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
                      (click)="setViewMode('card')"
                      [class.active]="viewMode() === 'card'"
                    >
                      <mat-icon>grid_view</mat-icon>
                      卡片视图
                    </button>
                  </mat-menu>

                  <button
                    mat-button
                    (click)="saveCurrentSearch()"
                    *ngIf="searchControl.value"
                  >
                    <mat-icon>bookmark_border</mat-icon>
                    保存搜索
                  </button>

                  <button
                    mat-button
                    [matMenuTriggerFor]="exportMenu"
                  >
                    <mat-icon>more_vert</mat-icon>
                  </button>
                  <mat-menu #exportMenu="matMenu">
                    <button mat-menu-item (click)="exportResults('json')">
                      <mat-icon>download</mat-icon>
                      导出 JSON
                    </button>
                    <button mat-menu-item (click)="exportResults('csv')">
                      <mat-icon>download</mat-icon>
                      导出 CSV
                    </button>
                  </mat-menu>
                </div>
              </div>

              <div class="search-suggestions" *ngIf="searchResponse()?.suggestions?.length">
                <span class="suggestions-label">您可能还可以尝试：</span>
                <button
                  mat-button
                  *ngFor="let suggestion of searchResponse()?.suggestions"
                  class="suggestion-chip"
                  (click)="searchSuggestion(suggestion)"
                >
                  {{ suggestion }}
                </button>
              </div>

              <div class="loading-overlay" *ngIf="isLoading()">
                <mat-spinner diameter="48"></mat-spinner>
                <span>搜索中...</span>
              </div>

              <div class="empty-state" *ngIf="!isLoading() && searchResponse() && searchResponse()!.total === 0">
                <mat-icon class="empty-icon">search_off</mat-icon>
                <h3>未找到相关结果</h3>
                <p>尝试使用不同的关键词或调整筛选条件</p>
                <div class="empty-suggestions" *ngIf="searchHistory().length > 0">
                  <h4>搜索历史</h4>
                  <div class="history-list">
                    <button
                      mat-button
                      *ngFor="let history of searchHistory().slice(0, 5)"
                      class="history-item"
                      (click)="searchHistoryItem(history)"
                    >
                      <mat-icon>history</mat-icon>
                      {{ history.query }}
                    </button>
                  </div>
                </div>
              </div>

              <div
                class="results-list"
                *ngIf="!isLoading() && searchResponse() && searchResponse()!.total > 0"
                [class.list-view]="viewMode() === 'list'"
                [class.card-view]="viewMode() === 'card'"
              >
                <app-search-result-item
                  *ngFor="let result of searchResponse()!.hits"
                  [result]="() => result"
                  [searchQuery]="searchControl.value || ''"
                  [viewMode]="viewMode()"
                  (itemClick)="onResultClick(result)"
                  (viewClick)="onViewClick(result)"
                  (navigateClick)="onNavigateClick(result)"
                ></app-search-result-item>
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

                <div class="page-numbers">
                  <button
                    *ngFor="let page of visiblePages()"
                    mat-button
                    [class.active]="page === currentPage()"
                    (click)="goToPage(page)"
                  >
                    {{ page }}
                  </button>
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
          </mat-sidenav-content>
        </mat-sidenav-container>
      </div>

      <mat-sidenav
        #historySidenav
        mode="over"
        position="end"
        [opened]="showHistory()"
        (closed)="showHistory.set(false)"
        class="history-sidenav"
      >
        <div class="history-panel">
          <div class="history-header">
            <h3>搜索历史</h3>
            <button mat-icon-button (click)="showHistory.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>

          <div class="history-content">
            <div
              class="history-list">
            </div>
            </div>
          </div>
      </mat-sidenav>

      <div class="save-dialog-overlay" *ngIf="showSaveDialog()">
        <div class="save-dialog ancient-card">
          <div class="dialog-header">
            <h3>保存搜索</h3>
            <button mat-icon-button (click)="showSaveDialog.set(false)">
              <mat-icon>close</mat-icon>
            </button>
          </div>
          <div class="dialog-content">
            <mat-form-field appearance="outline">
              <mat-label>搜索名称</mat-label>
              <input
                matInput
                [formControl]="saveNameControl"
                placeholder="输入搜索名称"
              />
            </mat-form-field>
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>描述（可选）</mat-label>
              <textarea
                matInput
                [formControl]="saveDescControl"
                rows="3"
                placeholder="添加搜索描述"
              ></textarea>
            </mat-form-field>
            <mat-checkbox [formControl]="savePublicControl">
              公开此搜索
            </mat-checkbox>
          </div>
          <div class="dialog-actions">
            <button mat-button (click)="showSaveDialog.set(false)">
              取消
            </button>
            <button
              mat-raised-button
              color="primary"
              (click)="confirmSaveSearch()"
              [disabled]="!saveNameControl.valid"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .search-page {
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
        max-width: 700px;

        .search-input-wrapper {
          width: 100%;

          .search-input {
            width: 100%;
            margin-bottom: -1.25em 0;
          }
        }
      }

      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 8px;

        .scope-button {
          min-width: auto;
        }

        button.active {
          background: rgba(200, 76, 59, 0.1);
          color: #c84c3b;
        }
      }
    }

    .suggestion-item {
      display: flex;
      align-items: center;
      gap: 8px;

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
        color: #8b7d65;
      }

      .suggestion-count {
        margin-left: auto;
        color: #9b8f7a;
        font-size: 12px;
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
      width: 320px;
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

          h5 {
            margin: 0 0 8px 0;
            font-size: 13px;
            font-weight: 500;
            color: #6b5d4a;
          }

          .filter-options {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .facet-group {
            margin-bottom: 16px;

            .facet-options {
              display: flex;
              flex-direction: column;
              gap: 6px;

              .facet-value {
                flex: 1;
              }

              .facet-count {
                color: #9b8f7a;
                font-size: 12px;
                margin-left: 4px;
              }
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

    .results-container {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
      position: relative;

      .results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        padding-bottom: 16px;
        border-bottom: 1px solid #e5dccb;

        .results-info {
          .results-count {
            font-size: 14px;
            color: #6b5d4a;

            strong {
              color: #5d4e37;
              font-weight: 600;
            }
          }

          .results-time {
            margin-left: 12px;
            font-size: 12px;
            color: #9b8f7a;
          }
        }

        .results-actions {
          display: flex;
          gap: 8px;
        }
      }

      .search-suggestions {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 20px;
        padding: 12px 16px;
        background: #fff9f5;
        border-left: 4px solid #c84c3b;
        border-radius: 4px;

        .suggestions-label {
          font-size: 13px;
          color: #6b5d4a;
        }

        .suggestion-chip {
          font-size: 13px;
          background: #fff;
          border: 1px solid #e5dccb;
          border-radius: 16px;
          padding: 4px 12px;

          &:hover {
            background: #f5f0e6;
          }
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
          margin: 0 0 24px 0;
          font-size: 14px;
          color: #9b8f7a;
        }

        .empty-suggestions {
          width: 100%;
          max-width: 500px;

          h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            color: #5d4e37;
          }

          .history-list {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            justify-content: center;

            .history-item {
              font-size: 13px;
              background: #fff;
              border: 1px solid #e5dccb;
              border-radius: 20px;
              padding: 6px 14px;

              mat-icon {
                font-size: 16px;
                width: 16px;
                height: 16px;
                margin-right: 6px;
              }

              &:hover {
                background: #f5f0e6;
              }
            }
          }
        }
      }

      .results-list {
        &.list-view {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        &.card-view {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
          gap: 16px;
        }
      }

      .pagination {
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 16px;
        margin-top: 32px;
        padding-top: 24px;
        border-top: 1px solid #e5dccb;

        .page-numbers {
          display: flex;
          gap: 4px;

          button {
            min-width: 40px;
            height: 40px;

            &.active {
              background: #c84c3b;
              color: #fff;
            }
          }
        }
      }
    }

    .history-sidenav {
      width: 360px;
      background: #faf7f0;

      .history-panel {
        padding: 20px;
        height: 100%;

        .history-header {
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

        .history-content {
          .history-tabs {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .history-section {
          h4 {
            margin: 0 0 12px 0;
            font-size: 14px;
            font-weight: 600;
            color: #5d4e37;
          }

          .saved-list,
          .history-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }

          .saved-item,
          .history-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px;
            background: #fff;
            border: 1px solid #e5dccb;
            border-radius: 4px;
            cursor: pointer;
            transition: all 0.2s;

            &:hover {
              background: #f5f0e6;
            }

            .item-main {
              flex: 1;
              min-width: 0;

              .item-name {
                font-size: 14px;
                font-weight: 500;
                color: #2c2416;
                margin-bottom: 4px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              }

              .item-meta {
                font-size: 12px;
                color: #9b8f7a;
              }
            }

            .item-actions {
              display: flex;
              gap: 4px;
            }
          }
        }
      }
    }

    .save-dialog-overlay {
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

      .save-dialog {
        width: 90%;
        max-width: 500px;

        .dialog-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding-bottom: 16px;
          margin-bottom: 16px;
          border-bottom: 2px solid #c84c3b;

          h3 {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #5d4e37;
            font-family: 'Noto Serif SC', serif;
          }
        }

        .dialog-content {
          display: flex;
          flex-direction: column;
          gap: 16px;

          .full-width {
            width: 100%;
          }
        }

        .dialog-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 24px;
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
  `]
})
export class SearchPageComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly searchService = inject(SearchService);
  private readonly destroy$ = new Subject<void>();

  readonly searchControl = new FormControl('');
  readonly startDateFilter = new FormControl<Date | null>(null);
  readonly endDateFilter = new FormControl<Date | null>(null);
  readonly sortControl = new FormControl('relevance');
  readonly saveNameControl = new FormControl('');
  readonly saveDescControl = new FormControl('');
  readonly savePublicControl = new FormControl(false);

  readonly isLoading = signal(false);
  readonly isSuggestLoading = signal(false);
  readonly showFilters = signal(true);
  readonly showHistory = signal(false);
  readonly showSaveDialog = signal(false);
  readonly viewMode = signal<'list' | 'card'>('list');

  readonly currentScope = signal<SearchScope>(SearchScope.ALL);
  readonly selectedScopes = signal<SearchScope[]>([]);
  readonly selectedFacets = signal<Record<string, string[]>>({});

  readonly searchResponse = signal<SearchResponse | null>(null);
  readonly suggestions = signal<SearchSuggestion[]>([]);
  readonly searchHistory = signal<SearchHistory[]>([]);
  readonly savedSearches = signal<SavedSearch[]>([]);
  readonly facets = signal<FacetResult[]>([]);

  readonly currentPage = signal(1);
  readonly pageSize = signal(20);

  readonly totalPages = computed(() => {
    const response = this.searchResponse();
    if (!response) return 0;
    return Math.ceil(response.total / this.pageSize());
  });

  readonly visiblePages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    const maxVisible = 5;

    if (total <= maxVisible) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      let start = Math.max(1, current - 2);
      let end = Math.min(total, current + 2);

      if (end - start < maxVisible - 1) {
        if (start === 1) {
          end = Math.min(total, maxVisible);
        } else {
          start = Math.max(1, total - maxVisible + 1);
        }
      }

      for (let i = start; i <= end; i++) pages.push(i);
    }

    return pages;
  });

  readonly scopeOptions = [
    { value: SearchScope.ALL, label: '全部', icon: 'search' },
    { value: SearchScope.PROJECT, label: '项目', icon: 'folder' },
    { value: SearchScope.DOCUMENT, label: '文档', icon: 'description' },
    { value: SearchScope.PAGE, label: '书页', icon: 'menu_book' },
    { value: SearchScope.ANNOTATION, label: '批注', icon: 'comment' },
    { value: SearchScope.COLLATION, label: '勘校文本', icon: 'edit_note' },
    { value: SearchScope.METADATA, label: '元数据', icon: 'label' }
  ];

  ngOnInit(): void {
    this.loadHistory();
    this.loadSavedSearches();
    this.setupSuggestions();

    const query = this.route.snapshot.queryParams['q'];
    if (query) {
      this.searchControl.setValue(query);
      this.performSearch();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSuggestions(): void {
    this.searchControl.valueChanges
      .pipe(
      filter((query): query is string => !!query && query.length >= 2),
      debounceTime(300),
      takeUntil(this.destroy$),
      switchMap((query) => {
        this.isSuggestLoading.set(true);
        return this.searchService.quickSuggestions(query).pipe(
          catchError(() => of([]))
        );
      })
      .subscribe({
        next: (suggestions) => {
          this.suggestions.set(suggestions);
          this.isSuggestLoading.set(false);
        },
        error: () => {
          this.suggestions.set([]);
          this.isSuggestLoading.set(false);
        }
      });
  }

  private loadHistory(): void {
    this.searchHistory.set(this.searchService.getHistory());
  }

  private loadSavedSearches(): void {
    this.savedSearches.set(this.searchService.getSavedSearches());
  }

  getCurrentScopeLabel(): string {
    return this.searchService.getScopeLabel(this.currentScope());
  }

  setScope(scope: SearchScope): void {
    this.currentScope.set(scope);
  }

  isScopeChecked(scope: SearchScope): boolean {
    return (this.selectedScopes().length === 0 && scope === SearchScope.ALL) ||
      this.selectedScopes().includes(scope) ||
      (this.currentScope() === scope);
  }

  toggleScope(scope: SearchScope): void {
    if (scope === SearchScope.ALL) {
      this.selectedScopes.set([]);
      this.currentScope.set(SearchScope.ALL);
    } else {
      this.selectedScopes.update(prev =>
        prev.includes(scope)
          ? prev.filter(s => s !== scope)
          : [...prev, scope]
      );
    }
  }

  toggleFacet(field: string, bucket: FacetBucket): void {
    this.selectedFacets.update(prev => {
      const current = prev[field] || [];
      const updated = current.includes(bucket.value)
        ? current.filter(v => v !== bucket.value)
        : [...current, bucket.value];

      return {
        ...prev,
        [field]: updated
      };
    });

    this.facets.update(prev =>
      prev.map(facet => {
        if (facet.field !== field) return facet;
        return {
          ...facet,
          buckets: facet.buckets.map(b =>
            b.value === bucket.value ? { ...b, selected: !b.selected } : b
          )
        };
      })
    );
  }

  performSearch(): void {
    const query = this.searchControl.value;
    if (!query) return;

    this.isLoading.set(true);

    const request: SearchRequest = {
      query,
      scope: this.selectedScopes().length > 0 ? this.selectedScopes() : this.currentScope(),
      page: this.currentPage(),
      pageSize: this.pageSize(),
      highlight: {
        fields: ['content', 'title'],
        preTag: '<mark>',
        postTag: '</mark>',
        fragmentSize: 150,
        numberOfFragments: 3,
        requireFieldMatch: false
      },
      facets: [
        { name: '类型', field: 'type', size: 10 },
        { name: '项目', field: 'projectName', size: 10 }
      ]
    };

    const [sortBy, sortOrder] = (this.sortControl.value || 'relevance').split('-');
    if (sortBy !== 'relevance') {
      request.sort = [{ field: sortBy, order: sortOrder as 'asc' | 'desc' }];
    }

    if (this.startDateFilter.value) {
      request.conditions = request.conditions || [];
      request.conditions.push({
        field: 'createdAt',
        operator: SearchOperator.GREATER_EQUAL,
        value: this.startDateFilter.value.toISOString()
      });
    }

    if (this.endDateFilter.value) {
      request.conditions = request.conditions || [];
      request.conditions.push({
        field: 'createdAt',
        operator: SearchOperator.LESS_EQUAL,
        value: this.endDateFilter.value.toISOString()
      });
    }

    Object.entries(this.selectedFacets()).forEach(([field, values]) => {
      if (values.length > 0) {
        request.conditions = request.conditions || [];
        request.conditions.push({
          field,
          operator: SearchOperator.IN,
          value: values
        });
      }
    });

    this.searchService.search(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.searchResponse.set(response);
          this.facets.set(response.facets);
          this.loadHistory();
          this.isLoading.set(false);

          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { q: query },
            queryParamsHandling: 'merge'
          });
        },
        error: () => {
          this.isLoading.set(false);
        }
      });
  }

  clearSearch(): void {
    this.searchControl.setValue('');
    this.suggestions.set([]);
  }

  clearFilters(): void {
    this.startDateFilter.setValue(null);
    this.endDateFilter.setValue(null);
    this.sortControl.setValue('relevance');
    this.selectedScopes.set([]);
    this.selectedFacets.set({});
    this.currentPage.set(1);
  }

  toggleFilters(): void {
    this.showFilters.update(v => !v);
  }

  onSuggestionSelected(event: any): void {
    this.searchControl.setValue(event.option.value);
    this.performSearch();
  }

  getSuggestionIcon(type: SearchScope): string {
    return this.searchService.getScopeIcon(type);
  }

  highlightSuggestion(text: string): string {
    const query = this.searchControl.value || '';
    if (!query) return text;
    return this.searchService.highlightText(text, query, '<strong>', '</strong>');
  }

  formatTook(): string {
    const response = this.searchResponse();
    return response ? response.took.toFixed(0) : '0';
  }

  setViewMode(mode: 'list' | 'card'): void {
    this.viewMode.set(mode);
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
      this.performSearch();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      this.performSearch();
    }
  }

  goToPage(page: number): void {
    this.currentPage.set(page);
    this.performSearch();
  }

  onResultClick(result: SearchResult): void {
    this.router.navigate(['/collation', result.projectId, 'workbench', {
      queryParams: { pageId: result.documentId }
    });
  }

  onViewClick(result: SearchResult): void {
    this.onResultClick(result);
  }

  onNavigateClick(result: SearchResult): void {
    this.onResultClick(result);
  }

  searchSuggestion(suggestion: string): void {
    this.searchControl.setValue(suggestion);
    this.performSearch();
  }

  searchHistoryItem(history: SearchHistory): void {
    this.searchControl.setValue(history.query);
    if (Array.isArray(history.scope)) {
      this.selectedScopes.set(history.scope as SearchScope[]);
    } else {
      this.currentScope.set(history.scope as SearchScope);
    }
    this.performSearch();
  }

  searchSavedSearch(saved: SavedSearch): void {
    this.searchControl.setValue(saved.request.query);
    this.performSearch();
  }

  saveCurrentSearch(): void {
    this.showSaveDialog.set(true);
    this.saveNameControl.setValue(this.searchControl.value || '');
    this.saveDescControl.setValue('');
    this.savePublicControl.setValue(false);
  }

  confirmSaveSearch(): void {
    if (!this.saveNameControl.valid) return;

    const request: SearchRequest = {
      query: this.searchControl.value || '',
      scope: this.selectedScopes().length > 0 ? this.selectedScopes() : this.currentScope(),
      page: 1,
      pageSize: this.pageSize()
    };

    this.searchService.saveSearch(
      this.saveNameControl.value || '',
      this.saveDescControl.value || undefined,
      request,
      this.savePublicControl.value || false
    );

    this.loadSavedSearches();
    this.showSaveDialog.set(false);
  }

  deleteSavedSearch(id: string): void {
    this.searchService.deleteSavedSearch(id);
    this.loadSavedSearches();
  }

  deleteHistoryItem(id: string): void {
    this.searchService.removeHistoryItem(id);
    this.loadHistory();
  }

  exportResults(format: 'json' | 'csv'): void {
    console.log('Exporting results as', format);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}

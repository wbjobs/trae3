// 检索服务 - 封装全文检索API

import { Injectable, inject } from '@angular/core';
import { Observable, map, tap, debounceTime, of } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
  SearchRequest,
  SearchResponse,
  SearchResult,
  SearchSuggestRequest,
  SearchSuggestResponse,
  SearchSuggestion,
  SearchScope,
  FacetResult,
  AdvancedFilter,
  SearchHistory,
  SavedSearch,
  SearchStats
} from '../../../core/models/search.model';

@Injectable({ providedIn: 'root' })
export class SearchService {
  private apiService = inject(ApiService);
  private readonly basePath = '/search';

  private readonly searchHistoryKey = 'search_history';
  private readonly savedSearchesKey = 'saved_searches';
  private readonly hotKeywordsKey = 'search_hot_keywords';
  private readonly searchResultCacheKey = 'search_result_cache';
  private readonly maxHistoryItems = 20;
  private readonly searchResultCacheTtl = 60 * 1000;
  private readonly debounceTimeMs = 300;

  private searchResultCache: Map<string, { data: SearchResponse; timestamp: number }> = new Map();

  /**
   * 执行全文检索
   * @param request 检索请求
   */
  search(request: SearchRequest): Observable<SearchResponse> {
    const cacheKey = this.generateSearchCacheKey(request);
    const cachedResult = this.getFromSearchCache(cacheKey);
    if (cachedResult) {
      return of(cachedResult);
    }

    return this.apiService.post<SearchResponse>(
      `${this.basePath}/query`,
      request
    ).pipe(
      tap((response) => {
        this.setSearchCache(cacheKey, response);
        if (response.total > 0) {
          this.addToHistory(request);
        }
      })
    );
  }

  private generateSearchCacheKey(request: SearchRequest): string {
    return `${request.query}_${request.page}_${request.pageSize}_${JSON.stringify(request.scope)}_${JSON.stringify(request.conditions)}`;
  }

  private getFromSearchCache(key: string): SearchResponse | null {
    const cached = this.searchResultCache.get(key);
    if (!cached) {
      return null;
    }
    const now = Date.now();
    if (now - cached.timestamp > this.searchResultCacheTtl) {
      this.searchResultCache.delete(key);
      return null;
    }
    return cached.data;
  }

  private setSearchCache(key: string, data: SearchResponse): void {
    this.searchResultCache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearSearchResultCache(): void {
    this.searchResultCache.clear();
  }

  /**
   * 快速搜索
   * @param query 搜索关键词
   * @param projectId 项目ID（可选）
   * @param scope 搜索范围（可选）
   */
  quickSearch(
    query: string,
    projectId?: string,
    scope: SearchScope = SearchScope.ALL
  ): Observable<SearchResponse> {
    const request: SearchRequest = {
      query,
      scope,
      projectId,
      page: 1,
      pageSize: 20,
      highlight: {
        fields: ['content', 'title'],
        preTag: '<mark>',
        postTag: '</mark>',
        fragmentSize: 150,
        numberOfFragments: 3,
        requireFieldMatch: false
      }
    };

    return this.search(request);
  }

  /**
   * 获取搜索建议
   * @param request 建议请求
   */
  getSuggestions(
    request: SearchSuggestRequest
  ): Observable<SearchSuggestResponse> {
    return this.apiService.get<SearchSuggestResponse>(
      `${this.basePath}/suggest`,
      { params: request as any }
    ).pipe(
      debounceTime(this.debounceTimeMs)
    );
  }

  /**
   * 快速获取搜索建议
   * @param query 关键词
   * @param projectId 项目ID（可选）
   */
  quickSuggestions(
    query: string,
    projectId?: string
  ): Observable<SearchSuggestion[]> {
    return this.getSuggestions({
      query,
      projectId,
      size: 10
    }).pipe(
      map((response) => response.suggestions)
    );
  }

  /**
   * 获取可用的高级筛选条件
   * @param scope 搜索范围
   */
  getAdvancedFilters(scope: SearchScope): Observable<AdvancedFilter[]> {
    return this.apiService.get<AdvancedFilter[]>(
      `${this.basePath}/advanced-filters`,
      { params: { scope } }
    );
  }

  /**
   * 获取分面检索结果
   * @param request 检索请求
   */
  getFacets(request: SearchRequest): Observable<FacetResult[]> {
    const facetRequest = { ...request, pageSize: 0 };
    return this.search(facetRequest).pipe(
      map((response) => response.facets)
    );
  }

  /**
   * 获取搜索统计信息
   */
  getStats(projectId?: string): Observable<SearchStats> {
    const params = projectId ? { projectId } : {};
    return this.apiService.get<SearchStats>(
      `${this.basePath}/stats`,
      { params }
    );
  }

  /**
   * 搜索历史 - 获取本地历史记录
   */
  getHistory(): SearchHistory[] {
    try {
      const stored = localStorage.getItem(this.searchHistoryKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * 搜索历史 - 添加记录
   */
  private addToHistory(request: SearchRequest): void {
    const history = this.getHistory();

    const existingIndex = history.findIndex(
      (h) => h.query === request.query &&
             JSON.stringify(h.scope) === JSON.stringify(request.scope)
    );

    if (existingIndex >= 0) {
      history.splice(existingIndex, 1);
    }

    const newItem: SearchHistory = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: '',
      query: request.query,
      scope: request.scope,
      filters: request.conditions?.reduce((acc, cond) => {
        acc[cond.field] = cond.value;
        return acc;
      }, {} as Record<string, any>),
      resultCount: 0,
      createdAt: new Date()
    };

    history.unshift(newItem);

    if (history.length > this.maxHistoryItems) {
      history.pop();
    }

    this.saveHistory(history);
  }

  /**
   * 搜索历史 - 保存到本地
   */
  private saveHistory(history: SearchHistory[]): void {
    try {
      localStorage.setItem(this.searchHistoryKey, JSON.stringify(history));
    } catch {
      console.warn('无法保存搜索历史到本地存储');
    }
  }

  /**
   * 搜索历史 - 清除单条记录
   */
  removeHistoryItem(id: string): void {
    const history = this.getHistory().filter((h) => h.id !== id);
    this.saveHistory(history);
  }

  /**
   * 搜索历史 - 清除所有记录
   */
  clearHistory(): void {
    this.saveHistory([]);
  }

  /**
   * 保存的搜索 - 获取列表
   */
  getSavedSearches(): SavedSearch[] {
    try {
      const stored = localStorage.getItem(this.savedSearchesKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  /**
   * 保存的搜索 - 新增
   */
  saveSearch(
    name: string,
    description: string | undefined,
    request: SearchRequest,
    isPublic: boolean = false
  ): SavedSearch {
    const saved = this.getSavedSearches();

    const newSearch: SavedSearch = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: '',
      name,
      description,
      request,
      isPublic,
      createdAt: new Date(),
      updatedAt: new Date(),
      runCount: 0
    };

    saved.unshift(newSearch);
    this.saveSavedSearches(saved);

    return newSearch;
  }

  /**
   * 保存的搜索 - 更新
   */
  updateSavedSearch(
    id: string,
    updates: Partial<Pick<SavedSearch, 'name' | 'description' | 'request' | 'isPublic'>>
  ): SavedSearch | null {
    const saved = this.getSavedSearches();
    const index = saved.findIndex((s) => s.id === id);

    if (index < 0) return null;

    saved[index] = {
      ...saved[index],
      ...updates,
      updatedAt: new Date()
    };

    this.saveSavedSearches(saved);
    return saved[index];
  }

  /**
   * 保存的搜索 - 删除
   */
  deleteSavedSearch(id: string): void {
    const saved = this.getSavedSearches().filter((s) => s.id !== id);
    this.saveSavedSearches(saved);
  }

  /**
   * 保存的搜索 - 执行
   */
  runSavedSearch(id: string): Observable<SearchResponse> | null {
    const saved = this.getSavedSearches().find((s) => s.id === id);
    if (!saved) return null;

    this.updateSavedSearch(id, {
      runCount: saved.runCount + 1
    });

    return this.search(saved.request);
  }

  /**
   * 保存的搜索 - 持久化到本地
   */
  private saveSavedSearches(saved: SavedSearch[]): void {
    try {
      localStorage.setItem(this.savedSearchesKey, JSON.stringify(saved));
    } catch {
      console.warn('无法保存搜索到本地存储');
    }
  }

  /**
   * 高亮文本中的关键词
   * @param text 原始文本
   * @param keyword 关键词
   * @param preTag 前置标签
   * @param postTag 后置标签
   */
  highlightText(
    text: string,
    keyword: string,
    preTag: string = '<mark>',
    postTag: string = '</mark>'
  ): string {
    if (!text || !keyword) return text;

    const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');

    return text.replace(regex, `${preTag}$1${postTag}`);
  }

  /**
   * 移除高亮标签
   * @param text 带高亮的文本
   */
  stripHighlight(text: string, preTag: string = '<mark>', postTag: string = '</mark>'): string {
    if (!text) return text;
    return text.replace(new RegExp(preTag, 'g'), '').replace(new RegExp(postTag, 'g'), '');
  }

  /**
   * 构建检索范围标签
   * @param scope 检索范围
   */
  getScopeLabel(scope: SearchScope): string {
    const scopeLabels: Record<SearchScope, string> = {
      [SearchScope.ALL]: '全部',
      [SearchScope.PROJECT]: '项目',
      [SearchScope.DOCUMENT]: '文档',
      [SearchScope.PAGE]: '书页',
      [SearchScope.ANNOTATION]: '批注',
      [SearchScope.COLLATION]: '勘校文本',
      [SearchScope.METADATA]: '元数据'
    };
    return scopeLabels[scope] || scope;
  }

  /**
   * 构建检索范围图标
   * @param scope 检索范围
   */
  getScopeIcon(scope: SearchScope): string {
    const scopeIcons: Record<SearchScope, string> = {
      [SearchScope.ALL]: 'search',
      [SearchScope.PROJECT]: 'folder',
      [SearchScope.DOCUMENT]: 'description',
      [SearchScope.PAGE]: 'menu_book',
      [SearchScope.ANNOTATION]: 'comment',
      [SearchScope.COLLATION]: 'edit_note',
      [SearchScope.METADATA]: 'label'
    };
    return scopeIcons[scope] || 'search';
  }

  getHotKeywords(topN: number = 10): Observable<string[]> {
    const localHotKeywords = this.getLocalHotKeywords();
    if (localHotKeywords.length > 0) {
      return of(localHotKeywords);
    }

    return this.apiService.get<string[]>(
      `${this.basePath}/hot-keywords`,
      { params: { topN } }
    ).pipe(
      tap((keywords) => {
        this.setLocalHotKeywords(keywords);
      })
    );
  }

  private getLocalHotKeywords(): string[] {
    try {
      const stored = localStorage.getItem(this.hotKeywordsKey);
      if (!stored) {
        return [];
      }
      const data = JSON.parse(stored);
      const now = Date.now();
      if (now - data.timestamp > 3600000) {
        localStorage.removeItem(this.hotKeywordsKey);
        return [];
      }
      return data.keywords || [];
    } catch {
      return [];
    }
  }

  private setLocalHotKeywords(keywords: string[]): void {
    try {
      localStorage.setItem(this.hotKeywordsKey, JSON.stringify({
        keywords,
        timestamp: Date.now()
      }));
    } catch {
      console.warn('无法保存热门搜索词到本地存储');
    }
  }

  clearLocalHotKeywords(): void {
    try {
      localStorage.removeItem(this.hotKeywordsKey);
    } catch {
      console.warn('无法清除热门搜索词本地缓存');
    }
  }

  clearSearchCache(): Observable<void> {
    return this.apiService.delete<void>(`${this.basePath}/cache`).pipe(
      tap(() => {
        this.clearSearchResultCache();
        this.clearLocalHotKeywords();
      })
    );
  }
}

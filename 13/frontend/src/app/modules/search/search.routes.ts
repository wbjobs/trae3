// 全文检索模块路由

import { Routes } from '@angular/router';

export const SEARCH_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/search-home/search-home.component').then(
        (m) => m.SearchHomeComponent
      ),
    title: '全文检索 - 古籍数字化勘校平台'
  },
  {
    path: 'results',
    loadComponent: () =>
      import('./pages/search-results/search-results.component').then(
        (m) => m.SearchResultsComponent
      ),
    title: '检索结果 - 古籍数字化勘校平台'
  },
  {
    path: 'advanced',
    loadComponent: () =>
      import('./pages/advanced-search/advanced-search.component').then(
        (m) => m.AdvancedSearchComponent
      ),
    title: '高级检索 - 古籍数字化勘校平台'
  }
];

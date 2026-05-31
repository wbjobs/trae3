// 勘校工作台模块路由

import { Routes } from '@angular/router';

export const COLLATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./components/page-list/page-list.component').then(
        (m) => m.PageListComponent
      ),
    title: '书页列表 - 古籍数字化勘校平台'
  },
  {
    path: ':projectId/workbench',
    loadComponent: () =>
      import('./components/collation-workbench/collation-workbench.component').then(
        (m) => m.CollationWorkbenchComponent
      ),
    title: '勘校工作台 - 古籍数字化勘校平台'
  },
  {
    path: ':projectId/compare',
    loadComponent: () =>
      import('./components/text-diff/text-diff.component').then(
        (m) => m.TextDiffComponent
      ),
    title: '文本比对 - 古籍数字化勘校平台'
  }
];

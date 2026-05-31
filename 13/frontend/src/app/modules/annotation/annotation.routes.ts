// 批注管理模块路由

import { Routes } from '@angular/router';

export const ANNOTATION_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/annotation-list/annotation-list.component').then(
        (m) => m.AnnotationListComponent
      ),
    title: '批注管理 - 古籍数字化勘校平台'
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./pages/annotation-create/annotation-create.component').then(
        (m) => m.AnnotationCreateComponent
      ),
    title: '创建批注 - 古籍数字化勘校平台'
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/annotation-detail/annotation-detail.component').then(
        (m) => m.AnnotationDetailComponent
      ),
    title: '批注详情 - 古籍数字化勘校平台'
  },
  {
    path: 'workspace/:projectId',
    loadComponent: () =>
      import('./pages/annotation-workspace/annotation-workspace.component').then(
        (m) => m.AnnotationWorkspaceComponent
      ),
    title: '批注工作台 - 古籍数字化勘校平台'
  }
];

// 项目管理模块路由

import { Routes } from '@angular/router';

export const PROJECT_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/project-list/project-list.component').then(
        (m) => m.ProjectListComponent
      ),
    title: '项目管理 - 古籍数字化勘校平台'
  },
  {
    path: 'create',
    loadComponent: () =>
      import('./pages/project-create/project-create.component').then(
        (m) => m.ProjectCreateComponent
      ),
    title: '创建项目 - 古籍数字化勘校平台'
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./pages/project-detail/project-detail.component').then(
        (m) => m.ProjectDetailComponent
      ),
    title: '项目详情 - 古籍数字化勘校平台'
  },
  {
    path: ':id/edit',
    loadComponent: () =>
      import('./pages/project-edit/project-edit.component').then(
        (m) => m.ProjectEditComponent
      ),
    title: '编辑项目 - 古籍数字化勘校平台'
  }
];

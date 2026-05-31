// 应用路由配置

import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { UserRole } from './core/models/user.model';

export const routes: Routes = [
  // 登录页面 - 公开访问
  {
    path: 'auth',
    loadChildren: () =>
      import('./modules/auth/auth.routes').then((m) => m.AUTH_ROUTES)
  },

  // 工作台 - 需要登录
  {
    path: 'dashboard',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/dashboard/dashboard.routes').then(
        (m) => m.DASHBOARD_ROUTES
      )
  },

  // 项目管理 - 需要登录
  {
    path: 'project',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/project/project.routes').then((m) => m.PROJECT_ROUTES)
  },

  // 勘校工作台 - 需要登录
  {
    path: 'collation',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/collation/collation.routes').then(
        (m) => m.COLLATION_ROUTES
      )
  },

  // 批注管理 - 需要登录
  {
    path: 'annotation',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/annotation/annotation.routes').then(
        (m) => m.ANNOTATION_ROUTES
      )
  },

  // 全文检索 - 需要登录
  {
    path: 'search',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/search/search.routes').then((m) => m.SEARCH_ROUTES)
  },

  // 文件管理 - 需要登录
  {
    path: 'file',
    canActivate: [AuthGuard],
    loadChildren: () =>
      import('./modules/file/file.routes').then((m) => m.FILE_ROUTES)
  },

  // 用户管理 - 仅管理员
  {
    path: 'admin',
    canActivate: [AuthGuard],
    data: { roles: [UserRole.ADMIN] },
    loadChildren: () =>
      import('./modules/admin/admin.routes').then((m) => m.ADMIN_ROUTES)
  },

  // 403禁止访问页面
  {
    path: 'forbidden',
    loadComponent: () =>
      import('./shared/components/forbidden/forbidden.component').then(
        (m) => m.ForbiddenComponent
      )
  },

  // 默认重定向到工作台
  {
    path: '',
    redirectTo: '/dashboard',
    pathMatch: 'full'
  },

  // 404页面 - 必须放在最后
  {
    path: '**',
    loadComponent: () =>
      import('./shared/components/not-found/not-found.component').then(
        (m) => m.NotFoundComponent
      )
  }
];

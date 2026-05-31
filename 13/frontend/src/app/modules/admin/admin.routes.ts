// 管理后台模块路由

import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    redirectTo: 'users',
    pathMatch: 'full'
  },
  {
    path: 'users',
    loadComponent: () =>
      import('./pages/user-management/user-management.component').then(
        (m) => m.UserManagementComponent
      ),
    title: '用户管理 - 古籍数字化勘校平台'
  },
  {
    path: 'users/create',
    loadComponent: () =>
      import('./pages/user-create/user-create.component').then(
        (m) => m.UserCreateComponent
      ),
    title: '创建用户 - 古籍数字化勘校平台'
  },
  {
    path: 'users/:id/edit',
    loadComponent: () =>
      import('./pages/user-edit/user-edit.component').then(
        (m) => m.UserEditComponent
      ),
    title: '编辑用户 - 古籍数字化勘校平台'
  },
  {
    path: 'roles',
    loadComponent: () =>
      import('./pages/role-management/role-management.component').then(
        (m) => m.RoleManagementComponent
      ),
    title: '角色管理 - 古籍数字化勘校平台'
  },
  {
    path: 'logs',
    loadComponent: () =>
      import('./pages/system-logs/system-logs.component').then(
        (m) => m.SystemLogsComponent
      ),
    title: '系统日志 - 古籍数字化勘校平台'
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./pages/system-settings/system-settings.component').then(
        (m) => m.SystemSettingsComponent
      ),
    title: '系统设置 - 古籍数字化勘校平台'
  }
];

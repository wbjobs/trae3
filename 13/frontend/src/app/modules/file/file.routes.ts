// 文件管理模块路由

import { Routes } from '@angular/router';

export const FILE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/file-manager/file-manager.component').then(
        (m) => m.FileManagerComponent
      ),
    title: '文件管理 - 古籍数字化勘校平台'
  },
  {
    path: 'upload',
    loadComponent: () =>
      import('./pages/file-upload/file-upload.component').then(
        (m) => m.FileUploadComponent
      ),
    title: '文件上传 - 古籍数字化勘校平台'
  },
  {
    path: 'viewer/:id',
    loadComponent: () =>
      import('./pages/file-viewer/file-viewer.component').then(
        (m) => m.FileViewerComponent
      ),
    title: '文件预览 - 古籍数字化勘校平台'
  }
];

import React, { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import MainLayout from '../layouts/MainLayout';

const UploadPage = lazy(() => import('../pages/UploadPage'));
const QualityPage = lazy(() => import('../pages/QualityPage'));
const ArchivePage = lazy(() => import('../pages/ArchivePage'));
const ArchiveDetailPage = lazy(() => import('../pages/ArchiveDetailPage'));

const LazyWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={
    <div className="flex items-center justify-center py-20">
      <Spin size="large" tip="加载中..." />
    </div>
  }>
    {children}
  </Suspense>
);

const router = createBrowserRouter([
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/upload" replace />
      },
      {
        path: 'upload',
        element: <LazyWrapper><UploadPage /></LazyWrapper>,
        loader: async () => {
          await Promise.all([
            import('../services/api')
          ]);
          return { apiReady: true };
        }
      },
      {
        path: 'quality',
        element: <LazyWrapper><QualityPage /></LazyWrapper>,
        loader: async () => {
          await Promise.all([
            import('../services/api')
          ]);
          return { apiReady: true };
        }
      },
      {
        path: 'archive',
        element: <LazyWrapper><ArchivePage /></LazyWrapper>,
        loader: async () => {
          await Promise.all([
            import('../services/api')
          ]);
          return { apiReady: true };
        }
      },
      {
        path: 'archive/:id',
        element: <LazyWrapper><ArchiveDetailPage /></LazyWrapper>,
        loader: async ({ params }) => {
          await Promise.all([
            import('../services/api')
          ]);
          return { 
            apiReady: true,
            archiveId: params.id 
          };
        }
      }
    ]
  }
]);

export default router;

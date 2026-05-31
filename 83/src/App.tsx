import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider, App as AntdApp, Spin } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import Layout from './components/Layout';
import Login from './pages/Login';
import { useAuthStore } from './stores/auth.store';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const CatalogList = lazy(() => import('./pages/CatalogList'));
const CatalogEditor = lazy(() => import('./pages/CatalogEditor'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const BatchImport = lazy(() => import('./pages/BatchImport'));

const LoadingFallback: React.FC = () => (
  <div className="min-h-[60vh] flex items-center justify-center">
    <Spin size="large" tip="加载中..." />
  </div>
);

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#5D4037',
          colorInfo: '#5D4037',
          colorSuccess: '#2E7D32',
          colorWarning: '#D4AF37',
          colorError: '#C62828',
          borderRadius: 8,
          fontFamily: '"Source Han Sans SC", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif',
        },
        components: {
          Button: {
            borderRadius: 8,
            controlHeight: 40,
          },
          Input: {
            borderRadius: 8,
            controlHeight: 40,
          },
          Select: {
            borderRadius: 8,
            controlHeight: 40,
          },
          Modal: {
            borderRadius: 12,
          },
        },
      }}
    >
      <AntdApp>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/*"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Suspense fallback={<LoadingFallback />}><Dashboard /></Suspense>} />
              <Route path="/upload" element={<Suspense fallback={<LoadingFallback />}><UploadPage /></Suspense>} />
              <Route path="/catalog/list" element={<Suspense fallback={<LoadingFallback />}><CatalogList /></Suspense>} />
              <Route path="/catalog/:id" element={<Suspense fallback={<LoadingFallback />}><CatalogEditor /></Suspense>} />
              <Route path="/search" element={<Suspense fallback={<LoadingFallback />}><SearchPage /></Suspense>} />
              <Route path="/batch-import" element={<Suspense fallback={<LoadingFallback />}><BatchImport /></Suspense>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
};

export default App;

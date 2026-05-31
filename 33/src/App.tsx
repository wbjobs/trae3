import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from '@/components/Layout';

const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const Map = lazy(() => import('@/pages/Map'));
const Approval = lazy(() => import('@/pages/Approval'));
const Statistics = lazy(() => import('@/pages/Statistics'));

function PageLoader() {
  return (
    <div className="flex h-64 items-center justify-center">
      <div className="space-y-3 text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        <p className="text-sm text-gray-400">页面加载中...</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/register" replace />} />
            <Route path="/register" element={<Register />} />
            <Route path="/map" element={<Map />} />
            <Route path="/approval" element={<Approval />} />
            <Route path="/statistics" element={<Statistics />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

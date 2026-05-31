import { useEffect, useState } from 'react';
import { Outlet, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import Sidebar from './Sidebar';
import Header from './Header';
import AlertBanner from './AlertBanner';

export default function Layout() {
  const { isAuthenticated, loadFromStorage } = useAuthStore();
  const [initialized, setInitialized] = useState(false);
  const location = useLocation();

  useEffect(() => {
    loadFromStorage();
    const timer = setTimeout(() => setInitialized(true), 100);
    return () => clearTimeout(timer);
  }, [loadFromStorage]);

  if (!initialized) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#F8FAFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">
          <AlertBanner />
          <Outlet />
        </main>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Upload,
  FileEdit,
  Search,
  Home,
  Settings,
  LogOut,
  Menu,
  X,
  User,
  ChevronDown,
  Database,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth.store';
import { cn } from '../lib/utils';

interface LayoutProps {
  children?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: Home, label: '仪表盘' },
    { path: '/upload', icon: Upload, label: '拓片上传' },
    { path: '/catalog/list', icon: FileEdit, label: '著录编辑' },
    { path: '/batch-import', icon: Database, label: '批量导入' },
    { path: '/search', icon: Search, label: '检索查询' },
  ];

  const getStatusBadgeClass = () => {
    switch (user?.role) {
      case 'admin':
        return 'bg-seal text-white';
      case 'operator':
        return 'bg-primary-600 text-white';
      case 'auditor':
        return 'bg-accent-600 text-white';
      default:
        return 'bg-ink-500 text-white';
    }
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'admin':
        return '系统管理员';
      case 'operator':
        return '录入员';
      case 'auditor':
        return '审核员';
      default:
        return '检索用户';
    }
  };

  return (
    <div className="min-h-screen bg-paper bg-paper-texture flex">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-primary-800 text-white transition-all duration-300 shadow-ink',
          sidebarOpen ? 'w-64' : 'w-20'
        )}
      >
        <div className="flex items-center justify-between h-20 px-6 border-b border-primary-700">
          {sidebarOpen && (
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent-500 flex items-center justify-center font-serif text-lg font-bold text-primary-900">
                拓
              </div>
              <div>
                <h1 className="font-serif text-lg font-bold tracking-wide">拓片管理系统</h1>
                <p className="text-xs text-primary-300">Rubbing Management</p>
              </div>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg hover:bg-primary-700 transition-colors"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="flex-1 py-6 px-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group',
                  isActive
                    ? 'bg-accent-500 text-primary-900 shadow-lg'
                    : 'text-primary-200 hover:bg-primary-700 hover:text-white'
                )
              }
            >
              <item.icon size={20} className="flex-shrink-0" />
              {sidebarOpen && <span className="font-medium">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-primary-700">
          <button
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-primary-200 hover:bg-primary-700 hover:text-white transition-colors"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
          >
            <User size={20} />
            {sidebarOpen && (
              <>
                <span className="flex-1 text-left">{user?.username}</span>
                <ChevronDown size={16} />
              </>
            )}
          </button>
          {userMenuOpen && sidebarOpen && (
            <div className="mt-2 space-y-1 bg-primary-700 rounded-lg overflow-hidden animate-scroll-reveal">
              <div className="px-4 py-3 border-b border-primary-600">
                <div className="flex items-center gap-2">
                  <span className={cn('px-2 py-0.5 rounded text-xs', getStatusBadgeClass())}>
                    {getRoleLabel()}
                  </span>
                </div>
                <p className="text-xs text-primary-300 mt-1">{user?.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-primary-200 hover:bg-primary-600 transition-colors"
              >
                <LogOut size={16} />
                退出登录
              </button>
            </div>
          )}
        </div>
      </aside>

      <main
        className={cn(
          'flex-1 min-h-screen transition-all duration-300',
          sidebarOpen ? 'ml-64' : 'ml-20'
        )}
      >
        <header className="sticky top-0 z-40 h-16 bg-white/80 backdrop-blur-sm border-b border-primary-100 shadow-sm flex items-center justify-between px-8">
          <div>
            <h2 className="font-serif text-xl text-primary-800">欢迎使用拓片数字化管理系统</h2>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-ink-500">
              {new Date().toLocaleDateString('zh-CN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long',
              })}
            </span>
          </div>
        </header>

        <div className="p-8">
          {children || <Outlet />}
        </div>
      </main>
    </div>
  );
};

export default Layout;

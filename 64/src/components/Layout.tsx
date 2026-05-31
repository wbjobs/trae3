import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ListTodo,
  Server,
  Search,
  Menu,
  X,
  Wifi,
  WifiOff,
  User,
  Bell,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NodeStatus, User as UserType } from '../../shared/types';

interface LayoutProps {
  user?: UserType;
  connectionStatus?: 'connected' | 'disconnected' | 'connecting';
}

const navItems = [
  { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
  { path: '/tasks', label: '任务管理', icon: ListTodo },
  { path: '/nodes', label: '节点监控', icon: Server },
  { path: '/results', label: '结果查询', icon: Search },
];

export default function Layout({ user, connectionStatus = 'connected' }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const location = useLocation();

  const connectionConfig = {
    connected: { icon: Wifi, color: 'text-cyber-400', label: '已连接' },
    disconnected: { icon: WifiOff, color: 'text-red-400', label: '已断开' },
    connecting: { icon: Wifi, color: 'text-yellow-400 animate-pulse', label: '连接中' },
  };

  const currentConfig = connectionConfig[connectionStatus];
  const ConnectionIcon = currentConfig.icon;

  return (
    <div className="min-h-screen bg-space-950 text-industrial-100 flex">
      <aside
        className={cn(
          'bg-space-900 border-r border-space-700 flex flex-col transition-all duration-300 ease-in-out',
          sidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-space-700">
          {!sidebarCollapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-space-400 to-cyber-500 rounded-lg flex items-center justify-center">
                <Server className="w-5 h-5 text-white" />
              </div>
              <span className="font-bold text-lg bg-gradient-to-r from-space-300 to-cyber-400 bg-clip-text text-transparent">
                分布式计算
              </span>
            </div>
          )}
          {sidebarCollapsed && (
            <div className="w-10 h-10 bg-gradient-to-br from-space-400 to-cyber-500 rounded-lg flex items-center justify-center mx-auto">
              <Server className="w-6 h-6 text-white" />
            </div>
          )}
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-1.5 rounded-lg hover:bg-space-800 transition-colors text-industrial-400 hover:text-white"
          >
            {sidebarCollapsed ? <Menu className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          <ul className="space-y-1 px-3">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200',
                      isActive
                        ? 'bg-space-700 text-white shadow-lg shadow-space-900/50 border border-space-600'
                        : 'text-industrial-400 hover:text-white hover:bg-space-800'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5 flex-shrink-0 transition-colors',
                        isActive && 'text-cyber-400'
                      )}
                    />
                    {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
                    {!sidebarCollapsed && isActive && (
                      <div className="ml-auto w-1.5 h-1.5 rounded-full bg-cyber-400 animate-pulse" />
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {!sidebarCollapsed && (
          <div className="p-4 border-t border-space-700">
            <div className="bg-space-800/50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-cyber-400 animate-pulse" />
                <span className="text-xs text-industrial-400">系统状态</span>
              </div>
              <p className="text-sm text-industrial-200 font-medium">
                {connectionStatus === 'connected' ? '系统运行正常' : '连接异常'}
              </p>
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-space-900/80 backdrop-blur-sm border-b border-space-700 flex items-center justify-between px-6 sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-semibold text-industrial-100">
              {navItems.find((item) => item.path === location.pathname)?.label || '系统面板'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-space-800/50 rounded-lg border border-space-700">
              <ConnectionIcon className={cn('w-4 h-4', currentConfig.color)} />
              <span className="text-sm text-industrial-300">{currentConfig.label}</span>
            </div>

            <button className="relative p-2 rounded-lg hover:bg-space-800 transition-colors text-industrial-400 hover:text-white">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            </button>

            <div className="relative">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-space-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-space-500 to-cyber-600 flex items-center justify-center">
                  <User className="w-4 h-4 text-white" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium text-industrial-100">
                    {user?.username || '管理员'}
                  </p>
                  <p className="text-xs text-industrial-400">{user?.role || 'admin'}</p>
                </div>
                <ChevronDown className="w-4 h-4 text-industrial-400" />
              </button>

              {userMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-space-800 border border-space-700 rounded-lg shadow-xl py-1 animate-fade-in z-50">
                  <button className="w-full px-4 py-2 text-left text-sm text-industrial-200 hover:bg-space-700 transition-colors">
                    个人设置
                  </button>
                  <button className="w-full px-4 py-2 text-left text-sm text-industrial-200 hover:bg-space-700 transition-colors">
                    系统配置
                  </button>
                  <div className="my-1 border-t border-space-700" />
                  <button className="w-full px-4 py-2 text-left text-sm text-red-400 hover:bg-space-700 transition-colors">
                    退出登录
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 p-6 overflow-auto bg-gradient-to-br from-space-950 via-space-900 to-space-950">
          <div className="max-w-7xl mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}



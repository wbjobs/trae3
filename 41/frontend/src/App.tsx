import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, AlertTriangle, Settings, Menu, X, Activity } from 'lucide-react';
import { Dashboard } from '@/pages/Dashboard';

function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: '监控面板', icon: LayoutDashboard },
    { path: '/nodes', label: '节点管理', icon: Server },
    { path: '/alerts', label: '告警中心', icon: AlertTriangle },
    { path: '/settings', label: '系统设置', icon: Settings },
  ];

  return (
    <>
      <div
        className={`fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
      />
      <aside
        className={`fixed lg:static inset-y-0 left-0 z-50 w-64 transform bg-slate-900/95 backdrop-blur border-r border-slate-700/50 transition-transform duration-300 lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-700/50 px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-cyan-500 to-blue-600">
              <Activity size={18} className="text-white" />
            </div>
            <span className="font-bold text-white">EdgeMonitor</span>
          </div>
          <button onClick={onClose} className="lg:hidden text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>
        <nav className="p-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-cyan-500/10 text-cyan-400'
                    : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                }`}
              >
                <Icon size={18} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

function AppLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const updateTime = () => {
      setCurrentTime(new Date().toLocaleString('zh-CN'));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="flex">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 min-w-0">
          <header className="sticky top-0 z-30 h-16 border-b border-slate-700/50 bg-slate-900/80 backdrop-blur">
            <div className="flex h-full items-center justify-between px-4 lg:px-6">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <Menu size={20} />
              </button>
              <div className="hidden lg:block text-sm text-slate-400">
                边缘节点监控系统 v1.0
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-slate-400 font-mono">{currentTime}</div>
              </div>
            </div>
          </header>
          <main className="p-4 lg:p-6">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/nodes" element={<NodesPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

function NodesPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">节点管理</h1>
      <div className="rounded-xl bg-slate-800/50 p-8 text-center text-slate-400 backdrop-blur">
        节点管理页面开发中...
      </div>
    </div>
  );
}

function AlertsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">告警中心</h1>
      <div className="rounded-xl bg-slate-800/50 p-8 text-center text-slate-400 backdrop-blur">
        告警中心页面开发中...
      </div>
    </div>
  );
}

function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-white">系统设置</h1>
      <div className="rounded-xl bg-slate-800/50 p-8 text-center text-slate-400 backdrop-blur">
        系统设置页面开发中...
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}

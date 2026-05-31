import { useState, useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  LineChart,
  AlertTriangle,
  Settings,
  Activity,
  Wifi,
  WifiOff,
  Gauge,
  Map,
} from 'lucide-react';
import { useMonitorStore } from '@/store/useMonitorStore';
import { formatTime } from '@/utils/time';

const navItems = [
  { path: '/', icon: LayoutDashboard, label: '监测面板' },
  { path: '/charts', icon: LineChart, label: '图表分析' },
  { path: '/alerts', icon: AlertTriangle, label: '异常告警' },
  { path: '/metrics', icon: Settings, label: '指标详情' },
  { path: '/pressure', icon: Gauge, label: '压力预警' },
  { path: '/region', icon: Map, label: '区域分析' },
];

export default function Layout() {
  const location = useLocation();
  const { wsConnected } = useMonitorStore();
  const [currentTime, setCurrentTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-screen bg-bg-primary text-white overflow-hidden">
      <aside className="w-60 bg-bg-secondary/50 backdrop-blur-sm border-r border-border-glow flex flex-col">
        <div className="p-5 border-b border-border-glow">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-accent-cyan to-accent-cyan-dark flex items-center justify-center shadow-glow-cyan">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg">监测系统</h1>
              <p className="text-xs text-gray-400">Monitoring System</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50 shadow-glow-cyan'
                    : 'text-gray-400 hover:bg-bg-tertiary/50 hover:text-white border border-transparent'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border-glow">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {wsConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-status-success" />
                  <span className="text-status-success">已连接</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-status-error" />
                  <span className="text-status-error">连接中断</span>
                </>
              )}
            </div>
            <span className="text-gray-500 font-number">{formatTime(currentTime)}</span>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-bg-secondary/30 backdrop-blur-sm border-b border-border-glow flex items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-accent-cyan animate-pulse" />
            <span className="text-sm text-gray-400">实时数据流运行中</span>
          </div>
          <div className="text-sm text-gray-500">
            实时监测与异常识别系统 v1.0.0
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

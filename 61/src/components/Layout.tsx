import { useState } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { Cpu, Radio, LayoutDashboard, Database, ChevronLeft, ChevronRight } from 'lucide-react';

const navItems = [
  { path: '/', label: '仪表盘', icon: Cpu },
  { path: '/sensors', label: '传感器管理', icon: Radio },
  { path: '/scada', label: '组态设计', icon: LayoutDashboard },
  { path: '/data', label: '数据查询', icon: Database },
];

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen bg-dark-bg">
      <nav
        className={`flex flex-col border-r border-dark-border bg-dark-card transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className="flex h-12 items-center justify-between border-b border-dark-border px-4">
          {!collapsed && (
            <span className="font-mono text-sm font-bold text-accent truncate">
              ISMP
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-7 w-7 items-center justify-center rounded text-dark-border hover:text-accent hover:bg-dark-border/30 transition-colors"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        <div className="flex-1 py-2">
          {navItems.map((item) => {
            const active = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 mx-2 h-10 rounded transition-colors ${
                  active
                    ? 'bg-accent/10 text-accent'
                    : 'text-status-offline hover:bg-dark-border/30 hover:text-white'
                } ${collapsed ? 'justify-center px-0' : 'px-3'}`}
              >
                <item.icon size={18} />
                {!collapsed && <span className="text-sm">{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center border-b border-dark-border bg-dark-card px-6">
          <h1 className="font-mono text-sm text-white">
            工业传感器监控平台
          </h1>
        </header>
        <main className="flex-1 overflow-auto p-4">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

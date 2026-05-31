import { NavLink, Outlet } from 'react-router-dom';
import { LayoutDashboard, ScanSearch, History, Flame } from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '仪表盘' },
  { to: '/detect', icon: ScanSearch, label: '检测工作台' },
  { to: '/history', icon: History, label: '历史记录' },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-dark-900 text-white">
      <aside className="w-64 bg-dark-800 flex flex-col border-r border-dark-700 shrink-0">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-thermal-gradient flex items-center justify-center">
            <Flame className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-thermal-gradient">ThermoAI</h1>
            <p className="text-xs text-neutral-400">热成像故障诊断</p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                  isActive
                    ? 'bg-dark-700 border-l-4 border-thermal-orange text-thermal-orange'
                    : 'text-neutral-400 hover:text-white hover:bg-dark-700 border-l-4 border-transparent'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-dark-700">
          <p className="text-xs text-neutral-500 text-center">ThermoAI v1.0</p>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

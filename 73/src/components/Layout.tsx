import { useState, useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { FlaskConical, Search, CheckSquare, LayoutDashboard, Menu, X, Bell, Download, AlertTriangle } from 'lucide-react';
import { api } from '@/utils/api';

const navItems = [
  { to: '/', label: '工作台', icon: LayoutDashboard },
  { to: '/register', label: '样品登记', icon: FlaskConical },
  { to: '/query', label: '流转查询', icon: Search },
  { to: '/approval', label: '审批管理', icon: CheckSquare },
];

const TYPE_ICONS: Record<string, any> = {
  approval: Bell,
  reminder: AlertTriangle,
  system: Bell,
};

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);
  const [notifyOpen, setNotifyOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = async () => {
    try {
      const [list, unread] = await Promise.all([
        api.getNotifications(false),
        api.getUnreadCount(),
      ]);
      setNotifications(list);
      setUnreadCount(unread.count);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleMarkRead = async (id: string) => {
    try {
      await api.markNotificationRead(id);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="flex h-screen bg-[#F5F7FA]">
      <aside
        className={`${collapsed ? 'w-16' : 'w-56'} flex-shrink-0 bg-[#0F4C75] text-white transition-all duration-300 flex flex-col`}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-white/10">
          {!collapsed && <span className="font-bold text-lg tracking-wide">样品流转</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="p-1 hover:bg-white/10 rounded">
            {collapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
        </div>
        <nav className="flex-1 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg transition-colors ${
                  isActive ? 'bg-[#E8A838] text-[#0F4C75] font-semibold' : 'text-white/80 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <item.icon size={20} />
              {!collapsed && <span className="text-sm">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          {!collapsed && <p className="text-xs text-white/50">样品流转管理系统 v1.0</p>}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-[#E2E8F0] flex items-center justify-between px-6 flex-shrink-0">
          <div className="text-sm text-gray-500">欢迎使用样品流转管理系统</div>
          <div className="relative">
            <button
              onClick={() => setNotifyOpen(!notifyOpen)}
              className="relative p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <Bell size={20} className="text-gray-600" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-medium">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            {notifyOpen && (
              <div
                className="absolute right-0 top-12 w-80 bg-white rounded-lg shadow-xl border border-[#E2E8F0] z-50 max-h-[400px] overflow-auto"
                onClick={e => e.stopPropagation()}
              >
                <div className="p-3 border-b border-[#E2E8F0] flex items-center justify-between">
                  <h3 className="font-semibold text-[#0F4C75]">通知中心</h3>
                  <span className="text-xs text-gray-400">每分钟自动刷新</span>
                </div>
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-gray-400 text-sm">暂无新通知</div>
                ) : (
                  <div>
                    {notifications.map(n => {
                      const Icon = TYPE_ICONS[n.type] || Bell;
                      return (
                        <div
                          key={n.id}
                          className="p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => handleMarkRead(n.id)}
                        >
                          <div className="flex items-start gap-3">
                            <Icon size={16} className={n.type === 'reminder' ? 'text-amber-500 mt-0.5' : 'text-[#0F4C75] mt-0.5'} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{n.title}</p>
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.content}</p>
                              <p className="text-xs text-gray-400 mt-1">{n.createdAt ? n.createdAt.slice(0, 19).replace('T', ' ') : '-'}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>
        <main className="flex-1 overflow-auto min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

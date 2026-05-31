import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, AlertTriangle, CheckCircle, Info, X } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useMessageStore } from '@/stores/messageStore';
import { useAlertStore } from '@/stores/alertStore';
import { useEffect, useState, useRef } from 'react';
import { ROLE_MAP } from '@/utils/constants';

const PAGE_TITLES: Record<string, string> = {
  '/register': '样本录入',
  '/map': '流转地图',
  '/approval': '审批路由',
  '/statistics': '数据统计',
  '/users': '用户管理',
};

const MSG_ICONS = {
  approval_pending: Info,
  approval_result: CheckCircle,
  transfer_received: CheckCircle,
  system: AlertTriangle,
  transfer_timeout: AlertTriangle,
  lab_capacity: AlertTriangle,
  status_anomaly: AlertTriangle,
};

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { unreadCount, fetchUnreadCount, messages, fetchMessages, markAsRead, markAllAsRead } = useMessageStore();
  const { alerts, unreadAlertCount, fetchAlerts } = useAlertStore();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUnreadCount();
    fetchMessages();
    fetchAlerts();
  }, [fetchUnreadCount, fetchMessages, fetchAlerts]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const title = PAGE_TITLES[location.pathname] || '科研样本流转追踪系统';
  const totalUnread = unreadCount + unreadAlertCount;

  const allNotifications = [
    ...alerts.map(a => ({ ...a, isAlert: true as const })),
    ...messages.filter(m => !m.read).map(m => ({ ...m, isAlert: false as const })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

  const handleClickNotification = (item: any) => {
    if (!item.read) {
      markAsRead(item.id);
    }
    if (item.relatedId && item.type === 'approval_pending') {
      navigate('/approval');
    } else if (item.relatedId && (item.type === 'approval_result' || item.type === 'transfer_received')) {
      navigate('/approval');
    } else if (item.type === 'transfer_timeout' || item.type === 'lab_capacity' || item.type === 'status_anomaly') {
      navigate('/map');
    }
    setShowDropdown(false);
  };

  return (
    <header className="flex h-16 items-center justify-between bg-white px-6 shadow-sm">
      <h2 className="text-lg font-semibold text-[#1E3A5F]">{title}</h2>
      <div className="flex items-center gap-4">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="relative p-1 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <Bell className="h-5 w-5 text-gray-500" />
            {totalUnread > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
                {totalUnread > 9 ? '9+' : totalUnread}
              </span>
            )}
          </button>
          {showDropdown && (
            <div className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-white shadow-xl border border-gray-100 z-50 animate-slideIn">
              <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                <span className="text-sm font-semibold text-[#1E3A5F]">通知与预警</span>
                <button onClick={() => { markAllAsRead(); setShowDropdown(false); }} className="text-xs text-accent hover:underline">
                  全部已读
                </button>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {allNotifications.length === 0 ? (
                  <div className="px-4 py-8 text-center text-sm text-gray-400">暂无通知</div>
                ) : (
                  allNotifications.map((item) => {
                    const Icon = MSG_ICONS[item.type as keyof typeof MSG_ICONS] || Info;
                    const isAlertType = item.isAlert || ['transfer_timeout', 'lab_capacity', 'status_anomaly'].includes(item.type);
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleClickNotification(item)}
                        className={`flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                          !item.read ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        <div className={`mt-0.5 rounded-lg p-1.5 ${isAlertType ? 'bg-amber-50' : 'bg-blue-50'}`}>
                          <Icon className={`h-3.5 w-3.5 ${isAlertType ? 'text-warning' : 'text-blue-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate text-xs font-medium text-[#1E3A5F]">{item.title}</p>
                            {!item.read && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-gray-500">{item.content}</p>
                          <p className="mt-1 text-[10px] text-gray-400 font-mono">
                            {new Date(item.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <span className="text-gray-700">{user?.username}</span>
          <span className="rounded bg-[#1E3A5F]/10 px-1.5 py-0.5 text-xs text-[#1E3A5F]">
            {user?.role ? ROLE_MAP[user.role] : ''}
          </span>
        </div>
      </div>
    </header>
  );
}

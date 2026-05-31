import { useLocation, useNavigate } from 'react-router-dom';
import { TestTube, Map, ClipboardCheck, BarChart3, LogOut, Users, ShieldCheck, Eye } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { ROLE_MAP } from '@/utils/constants';

type UserRole = 'admin' | 'approver' | 'experimenter' | 'viewer';

const ALL_NAV_ITEMS = [
  { path: '/register', label: '样本录入', icon: TestTube, roles: ['admin', 'approver', 'experimenter'] },
  { path: '/map', label: '流转地图', icon: Map, roles: ['admin', 'approver', 'experimenter', 'viewer'] },
  { path: '/approval', label: '审批路由', icon: ClipboardCheck, roles: ['admin', 'approver', 'experimenter'] },
  { path: '/statistics', label: '数据统计', icon: BarChart3, roles: ['admin', 'approver', 'experimenter', 'viewer'] },
];

const ADMIN_ITEMS = [
  { path: '/users', label: '用户管理', icon: Users },
];

const ROLE_ICONS: Record<UserRole, typeof ShieldCheck> = {
  admin: ShieldCheck,
  approver: ClipboardCheck,
  experimenter: TestTube,
  viewer: Eye,
};

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const role = user?.role || 'viewer';
  const isAdmin = role === 'admin';
  const RoleIcon = ROLE_ICONS[role];

  const navItems = ALL_NAV_ITEMS.filter(item => item.roles.includes(role));

  return (
    <aside className="flex w-64 flex-col bg-gradient-to-b from-[#1E3A5F] to-[#0A2540] text-white">
      <div className="flex h-16 items-center justify-center border-b border-white/10 px-4">
        <TestTube className="mr-2 h-6 w-6 text-accent" />
        <h1 className="text-sm font-bold leading-tight">科研样本流转追踪系统</h1>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center rounded-lg px-3 py-2.5 text-sm transition-all ${
                isActive
                  ? 'bg-white/15 text-accent border-l-4 border-accent'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="mr-3 h-5 w-5" />
              {item.label}
            </button>
          );
        })}
        {isAdmin && ADMIN_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex w-full items-center rounded-lg px-3 py-2.5 text-sm transition-all ${
                isActive
                  ? 'bg-white/15 text-accent border-l-4 border-accent'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="mr-3 h-5 w-5" />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-white">
            {user?.username?.charAt(0).toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium">{user?.username}</p>
            <div className="flex items-center gap-1">
              <RoleIcon className="h-3 w-3 text-white/50" />
              <p className="truncate text-xs text-white/50">{role ? ROLE_MAP[role] : ''}</p>
            </div>
          </div>
          <button onClick={logout} className="text-white/50 hover:text-white transition-colors" title="退出登录">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

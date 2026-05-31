import { useState } from 'react';
import { Layout, Menu, Avatar, Dropdown } from 'antd';
import {
  LayoutDashboard,
  Database,
  AlertTriangle,
  Layers,
  FileBarChart,
  Settings,
  User,
  LogOut,
  ChevronDown,
  Sun,
  Zap,
} from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';

const { Sider, Header, Content } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

const menuItems = [
  {
    key: '/dashboard',
    icon: <LayoutDashboard className="w-5 h-5" />,
    label: '实时监测',
  },
  {
    key: '/data-query',
    icon: <Database className="w-5 h-5" />,
    label: '数据查询',
  },
  {
    key: '/fault-analysis',
    icon: <AlertTriangle className="w-5 h-5" />,
    label: '故障分析',
  },
  {
    key: '/array-group',
    icon: <Layers className="w-5 h-5" />,
    label: '阵列分组',
  },
  {
    key: '/report-center',
    icon: <FileBarChart className="w-5 h-5" />,
    label: '报表中心',
  },
];

const userMenuItems = [
  {
    key: 'profile',
    icon: <User className="w-4 h-4" />,
    label: '个人中心',
  },
  {
    key: 'settings',
    icon: <Settings className="w-4 h-4" />,
    label: '系统设置',
  },
  {
    type: 'divider' as const,
  },
  {
    key: 'logout',
    icon: <LogOut className="w-4 h-4" />,
    label: '退出登录',
  },
];

export default function MainLayout({ children }: MainLayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Layout className="min-h-screen bg-zinc-950">
      <Sider
        trigger={null}
        collapsible
        collapsed={collapsed}
        width={240}
        className="bg-zinc-900 border-r border-zinc-800"
        theme="dark"
      >
        <div className="h-16 flex items-center justify-center gap-3 border-b border-zinc-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
            <Zap className="w-6 h-6 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-white font-bold text-sm">光伏监测系统</span>
              <span className="text-zinc-500 text-xs">PV Monitoring</span>
            </div>
          )}
        </div>

        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          className="bg-transparent border-0 mt-4"
          theme="dark"
        />

        <div className="absolute bottom-4 left-0 right-0 px-4">
          <div
            className={`flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 cursor-pointer hover:bg-zinc-800 transition-colors ${
              collapsed ? 'justify-center' : ''
            }`}
            onClick={() => setCollapsed(!collapsed)}
          >
            <ChevronDown
              className={`w-5 h-5 text-zinc-400 transition-transform ${
                collapsed ? 'rotate-90' : '-rotate-90'
              }`}
            />
            {!collapsed && (
              <span className="text-zinc-400 text-sm">
                {collapsed ? '展开' : '收起'}菜单
              </span>
            )}
          </div>
        </div>
      </Sider>

      <Layout>
        <Header className="bg-zinc-900 border-b border-zinc-800 h-16 flex items-center justify-between px-6">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-white">
              {menuItems.find((m) => m.key === location.pathname)?.label || '光伏监测系统'}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <Sun className="w-4 h-4 text-emerald-400" />
              <span className="text-emerald-400 text-sm font-medium">系统运行正常</span>
            </div>

            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div className="flex items-center gap-3 cursor-pointer hover:bg-zinc-800 px-3 py-2 rounded-lg transition-colors">
                <Avatar size={32} className="bg-gradient-to-br from-blue-500 to-violet-600">
                  <User className="w-5 h-5" />
                </Avatar>
                <div className="hidden md:block">
                  <div className="text-white text-sm font-medium">管理员</div>
                  <div className="text-zinc-500 text-xs">admin@pv.com</div>
                </div>
              </div>
            </Dropdown>
          </div>
        </Header>

        <Content className="p-6 bg-zinc-950 overflow-auto">
          {children}
        </Content>
      </Layout>
    </Layout>
  );
}

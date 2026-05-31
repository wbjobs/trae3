import { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Layout, Menu, Avatar, Dropdown, Badge } from 'antd';
import {
  Upload,
  CheckSquare,
  Search,
  Bell,
  Settings,
  LogOut,
  User,
  FileText
} from 'lucide-react';
import { useAppStore } from '../store/appStore';

const { Header, Sider, Content } = Layout;

const MainLayout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    {
      key: '/upload',
      icon: <Upload size={20} />,
      label: '成果上传'
    },
    {
      key: '/quality',
      icon: <CheckSquare size={20} />,
      label: '质检查看'
    },
    {
      key: '/archive',
      icon: <Search size={20} />,
      label: '档案检索'
    }
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <User size={16} />,
      label: '个人中心'
    },
    {
      key: 'settings',
      icon: <Settings size={16} />,
      label: '系统设置'
    },
    {
      type: 'divider' as const
    },
    {
      key: 'logout',
      icon: <LogOut size={16} />,
      label: '退出登录'
    }
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const getSelectedKey = () => {
    const path = location.pathname;
    if (path.startsWith('/archive')) return '/archive';
    if (path.startsWith('/quality')) return '/quality';
    if (path.startsWith('/upload')) return '/upload';
    return path;
  };

  return (
    <Layout className="min-h-screen">
      <Header className="flex items-center justify-between px-6 bg-white shadow-sm" style={{ padding: '0 24px' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center">
            <FileText className="text-white" size={22} />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-gray-800 m-0">测绘档案管理系统</h1>
            <p className="text-xs text-gray-500 m-0">Surveying Archive Management</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Badge count={3} size="small">
            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <Bell size={20} className="text-gray-600" />
            </button>
          </Badge>
          
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 px-3 py-2 rounded-lg transition-colors">
              <Avatar size={36} src={user?.avatar} />
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-gray-800 m-0">{user?.name}</p>
                <p className="text-xs text-gray-500 m-0">
                  {user?.role === 'admin' ? '系统管理员' : user?.role === 'inspector' ? '质检员' : '上传员'}
                </p>
              </div>
            </div>
          </Dropdown>
        </div>
      </Header>

      <Layout>
        <Sider
          width={220}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          theme="light"
          className="border-r border-gray-100"
        >
          <Menu
            mode="inline"
            selectedKeys={[getSelectedKey()]}
            items={menuItems}
            onClick={handleMenuClick}
            className="border-none mt-2"
          />
        </Sider>

        <Content className="bg-gray-50 p-6">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;

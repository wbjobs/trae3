import React, { useState } from 'react';
import { Layout, Menu, theme } from 'antd';
import {
  DashboardOutlined,
  FileTextOutlined,
  CarOutlined,
  SettingOutlined,
  AlertOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Header, Sider } = Layout;

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    token: { colorBgContainer },
  } = theme.useToken();

  const getSelectedKey = () => {
    if (location.pathname.startsWith('/terminals')) return '/terminals';
    return location.pathname;
  };

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '仪表盘',
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: '日志审计',
    },
    {
      key: '/terminals',
      icon: <CarOutlined />,
      label: '终端管理',
    },
    {
      key: '/alerts',
      icon: <AlertOutlined />,
      label: '告警中心',
    },
    {
      key: '/timeline',
      icon: <HistoryOutlined />,
      label: '历史回溯',
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={180}
      >
        <div style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: collapsed ? 14 : 18, fontWeight: 'bold' }}>
          {collapsed ? '日志' : '日志审计系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: '0 24px', background: colorBgContainer, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>
            {menuItems.find(item => getSelectedKey() === item.key)?.label || '日志审计系统'}
          </h2>
        </Header>
        {children}
      </Layout>
    </Layout>
  );
};

export default MainLayout;
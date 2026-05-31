import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { Layout, Menu, theme, Badge, Avatar, Dropdown, Space, Spin, Skeleton, Button } from 'antd';
import type { MenuProps } from 'antd';
import {
  DashboardOutlined,
  DesktopOutlined,
  FolderOpenOutlined,
  FileZipOutlined,
  CloudUploadOutlined,
  FileTextOutlined,
  SettingOutlined,
  UserOutlined,
  BellOutlined,
  LogoutOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  SearchOutlined
} from '@ant-design/icons';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import apiService from './services/apiClient';

const { Header, Sider, Content } = Layout;

const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const TerminalList = React.lazy(() => import('./pages/TerminalList'));
const TerminalDiscover = React.lazy(() => import('./pages/TerminalDiscover'));
const GroupList = React.lazy(() => import('./pages/GroupList'));
const FirmwareList = React.lazy(() => import('./pages/FirmwareList'));
const TaskList = React.lazy(() => import('./pages/TaskList'));
const TaskDetail = React.lazy(() => import('./pages/TaskDetail'));
const LogList = React.lazy(() => import('./pages/LogList'));
const Settings = React.lazy(() => import('./pages/Settings'));

type MenuItem = Required<MenuProps>['items'][number] & {
  responsive?: boolean;
};

const LoadingFallback: React.FC = () => (
  <div style={{ padding: 24 }}>
    <Skeleton active paragraph={{ rows: 8 }} />
  </div>
);

const PageFallback: React.FC = () => (
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center', 
    height: '100%',
    minHeight: 400
  }}>
    <Spin size="large" tip="页面加载中..." />
  </div>
);

const App: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const [connected, setConnected] = useState(false);
  const [mobileMode, setMobileMode] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const {
    token: { colorBgContainer }
  } = theme.useToken();

  useEffect(() => {
    const checkMobile = () => {
      const isMobile = window.innerWidth < 768;
      setMobileMode(isMobile);
      if (isMobile) {
        setCollapsed(true);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        const result = await apiService.getHealth();
        setConnected(result.success);
      } catch {
        setConnected(false);
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const menuItems: MenuItem[] = useMemo(() => [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '仪表盘'
    },
    {
      key: '/terminals',
      icon: <DesktopOutlined />,
      label: '终端管理'
    },
    {
      key: '/discover',
      icon: <SearchOutlined />,
      label: '终端发现',
      responsive: true
    },
    {
      key: '/groups',
      icon: <FolderOpenOutlined />,
      label: '分组管理'
    },
    {
      key: '/firmwares',
      icon: <FileZipOutlined />,
      label: '固件管理'
    },
    {
      key: '/tasks',
      icon: <CloudUploadOutlined />,
      label: '升级任务'
    },
    {
      key: '/logs',
      icon: <FileTextOutlined />,
      label: '操作日志'
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置',
      responsive: true
    }
  ], []);

  const visibleMenuItems = useMemo(() => {
    if (mobileMode && collapsed) {
      return menuItems;
    }
    return menuItems.filter(item => !item.responsive || !mobileMode);
  }, [menuItems, mobileMode, collapsed]);

  const userMenuItems = [
    {
      key: '1',
      icon: <UserOutlined />,
      label: '个人中心'
    },
    {
      key: '2',
      icon: <SettingOutlined />,
      label: '设置'
    },
    {
      type: 'divider' as const
    },
    {
      key: '3',
      icon: <LogoutOutlined />,
      label: '退出登录'
    }
  ];

  const handleMenuClick = useCallback(({ key }: { key: string }) => {
    navigate(key);
    if (mobileMode) {
      setCollapsed(true);
    }
  }, [navigate, mobileMode]);

  const selectedKey = location.pathname.startsWith('/tasks/') ? '/tasks' : location.pathname;

  const toggleCollapsed = useCallback(() => {
    setCollapsed(prev => !prev);
  }, []);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={240}
        collapsedWidth={mobileMode ? 0 : 64}
        style={{
          overflow: 'auto',
          height: '100vh',
          position: 'sticky',
          top: 0,
          left: 0,
          transition: 'all 0.2s'
        }}
        breakpoint="lg"
        onBreakpoint={(broken) => {
          if (broken) setCollapsed(true);
        }}
      >
        <div style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          fontSize: collapsed ? 12 : 16,
          fontWeight: 600,
          background: 'rgba(255,255,255,0.1)',
          whiteSpace: 'nowrap',
          overflow: 'hidden'
        }}>
          {collapsed ? 'FRM' : '固件管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={visibleMenuItems}
          onClick={handleMenuClick}
          style={{ border: 'none' }}
        />
      </Sider>
      <Layout>
        <Header style={{
          padding: '0 16px',
          background: colorBgContainer,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: '0 1px 4px rgba(0,21,41,0.08)',
          height: 64,
          position: 'sticky',
          top: 0,
          zIndex: 10,
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleCollapsed}
              style={{ fontSize: '16px', width: 64, height: 64 }}
            />
            <Space wrap={false}>
              <Badge status={connected ? 'success' : 'error'} />
              <span style={{ 
                color: connected ? '#52c41a' : '#ff4d4f', 
                fontSize: 13,
                display: mobileMode ? 'none' : 'inline'
              }}>
                {connected ? '服务已连接' : '服务未连接'}
              </span>
            </Space>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Badge count={0} size="small">
              <BellOutlined style={{ fontSize: 18, cursor: 'pointer', color: '#666' }} />
            </Badge>
            {!mobileMode && (
              <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
                <Space style={{ cursor: 'pointer' }}>
                  <Avatar size="small" icon={<UserOutlined />} />
                  <span>管理员</span>
                </Space>
              </Dropdown>
            )}
          </div>
        </Header>
        <Content 
          style={{ 
            margin: 0, 
            overflow: 'auto',
            minHeight: 'calc(100vh - 64px)',
            background: '#f0f2f5'
          }}
        >
          <Suspense fallback={<PageFallback />}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/terminals" element={<TerminalList />} />
              <Route path="/discover" element={<TerminalDiscover />} />
              <Route path="/groups" element={<GroupList />} />
              <Route path="/firmwares" element={<FirmwareList />} />
              <Route path="/tasks" element={<TaskList />} />
              <Route path="/tasks/:id" element={<TaskDetail />} />
              <Route path="/logs" element={<LogList />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Suspense>
        </Content>
      </Layout>
    </Layout>
  );
};

export default App;

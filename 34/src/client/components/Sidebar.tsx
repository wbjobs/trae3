import React from 'react';
import { Layout, Menu } from 'antd';
import {
  DashboardOutlined,
  UnorderedListOutlined,
  PlusCircleOutlined,
  HddOutlined,
  BarChartOutlined,
} from '@ant-design/icons';
import { useLocation, useNavigate } from 'react-router-dom';

const { Sider } = Layout;

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    {
      key: '/',
      icon: <DashboardOutlined />,
      label: '系统概览',
    },
    {
      key: '/tasks',
      icon: <UnorderedListOutlined />,
      label: '任务管理',
      children: [
        { key: '/tasks', icon: <UnorderedListOutlined />, label: '任务列表' },
        { key: '/tasks/new', icon: <PlusCircleOutlined />, label: '新建任务' },
      ],
    },
    {
      key: '/nodes',
      icon: <HddOutlined />,
      label: '节点监控',
    },
    {
      key: '/analytics',
      icon: <BarChartOutlined />,
      label: '数据分析',
      disabled: true,
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  const getSelectedKeys = (): string[] => {
    const path = location.pathname;
    if (path.startsWith('/tasks')) {
      return ['/tasks', path];
    }
    return [path];
  };

  return (
    <Sider width={220} style={{ background: '#001529' }}>
      <Menu
        mode="inline"
        selectedKeys={getSelectedKeys()}
        openKeys={['/tasks']}
        onClick={handleMenuClick}
        style={{ height: '100%', borderRight: 0, background: '#001529' }}
        theme="dark"
        items={menuItems}
      />
    </Sider>
  );
};

export default Sidebar;

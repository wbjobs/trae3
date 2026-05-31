import React from 'react';
import { Layout, Button, Space, Badge, Avatar, Dropdown, Menu } from 'antd';
import {
  DashboardOutlined,
  ExperimentOutlined,
  HddOutlined,
  BellOutlined,
  UserOutlined,
} from '@ant-design/icons';
import socketService from '../services/socket';

const { Header } = Layout;

const AppHeader: React.FC = () => {
  const [connected, setConnected] = React.useState(false);

  React.useEffect(() => {
    socketService.connect();

    const handleConnect = () => setConnected(true);
    const handleDisconnect = () => setConnected(false);

    socketService.on('socket:connected', handleConnect);
    socketService.on('socket:disconnected', handleDisconnect);

    setConnected(socketService.isConnected());

    return () => {
      socketService.off('socket:connected', handleConnect);
      socketService.off('socket:disconnected', handleDisconnect);
    };
  }, []);

  const userMenu = (
    <Menu>
      <Menu.Item key="profile">
        <UserOutlined /> 个人中心
      </Menu.Item>
      <Menu.Item key="settings">
        <DashboardOutlined /> 系统设置
      </Menu.Item>
      <Menu.Divider />
      <Menu.Item key="logout">退出登录</Menu.Item>
    </Menu>
  );

  return (
    <Header
      style={{
        background: '#001529',
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <ExperimentOutlined
          style={{ color: '#1890ff', fontSize: '24px', marginRight: '12px' }}
        />
        <h1 style={{ color: '#fff', margin: 0, fontSize: '18px' }}>
          CFD 分布式计算调度系统
        </h1>
      </div>

      <Space size="middle">
        <Space>
          <Badge status={connected ? 'success' : 'error'} />
          <span style={{ color: '#fff', fontSize: '12px' }}>
            {connected ? '实时连接' : '已断开'}
          </span>
        </Space>

        <Badge count={0}>
          <Button
            type="text"
            icon={<BellOutlined style={{ color: '#fff', fontSize: '18px' }} />}
          />
        </Badge>

        <Dropdown overlay={userMenu}>
          <Avatar icon={<UserOutlined />} style={{ cursor: 'pointer' }} />
        </Dropdown>
      </Space>
    </Header>
  );
};

export default AppHeader;

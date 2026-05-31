import { useState } from 'react'
import { Layout, Menu, Dropdown, Avatar, Select, Button } from 'antd'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import {
  FileTextOutlined,
  SearchOutlined,
  PaperClipOutlined,
  SettingOutlined,
  UserOutlined,
  LogoutOutlined,
  ApartmentOutlined,
  SafetyOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { useAuthStore } from '../store/authStore'

const { Header, Sider, Content } = Layout
const { Option } = Select

const MainLayout = () => {
  const [collapsed, setCollapsed] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const tenantId = useAuthStore((state) => state.tenantId)
  const logout = useAuthStore((state) => state.logout)
  const setTenant = useAuthStore((state) => state.setTenant)

  const menuItems = [
    {
      key: '/samples',
      icon: <FileTextOutlined />,
      label: '样本管理',
    },
    {
      key: '/cross-dept-query',
      icon: <SearchOutlined />,
      label: '跨科室查询',
    },
    {
      key: '/attachments',
      icon: <PaperClipOutlined />,
      label: '附件管理',
    },
    {
      key: '/admin',
      icon: <SettingOutlined />,
      label: '系统管理',
      children: [
        {
          key: '/admin/validation-rules',
          icon: <SafetyOutlined />,
          label: '校验规则',
        },
        {
          key: '/admin/tenants',
          icon: <TeamOutlined />,
          label: '租户管理',
        },
      ],
    },
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const userMenuItems = [
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: handleLogout,
    },
  ]

  const handleTenantChange = (value: number) => {
    setTenant(value)
    window.location.reload()
  }

  const getSelectedKeys = () => {
    const path = location.pathname
    if (path.startsWith('/admin')) {
      return [path, '/admin']
    }
    return [path]
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        theme="dark"
        width={220}
      >
        <div
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: collapsed ? 14 : 18,
            fontWeight: 'bold',
          }}
        >
          {collapsed ? '样本' : '样本管理系统'}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={getSelectedKeys()}
          openKeys={location.pathname.startsWith('/admin') ? ['/admin'] : []}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 16,
            boxShadow: '0 1px 4px rgba(0,21,41,.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ApartmentOutlined style={{ color: '#666' }} />
            <Select
              value={tenantId}
              onChange={handleTenantChange}
              style={{ width: 150 }}
              placeholder="选择租户"
            >
              <Option value={1}>默认租户</Option>
              <Option value={2}>租户2</Option>
              <Option value={3}>租户3</Option>
            </Select>
          </div>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <Avatar icon={<UserOutlined />} size="small" />
              <span>{user?.realName || user?.username}</span>
            </div>
          </Dropdown>
          <Button type="text" icon={<LogoutOutlined />} onClick={handleLogout}>
            退出
          </Button>
        </Header>
        <Content
          style={{
            margin: '24px',
            padding: 24,
            background: '#fff',
            borderRadius: 8,
            minHeight: 'calc(100vh - 112px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout

import React from 'react'
import { Layout, Menu, Breadcrumb, Avatar, Dropdown, theme } from 'antd'
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  UserOutlined,
  LogoutOutlined,
  AppstoreOutlined,
  SettingOutlined,
  PictureOutlined,
  TeamOutlined,
  LinkOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import { Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAppSelector, useAppDispatch } from '@/store'
import { toggleSidebar } from '@/store/app'
import { useAuth } from '@/hooks'
import styles from './MainLayout.module.css'

const { Header, Sider, Content } = Layout

const MainLayout: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { user, logout } = useAuth()
  const { sidebarCollapsed } = useAppSelector(state => state.app)
  const {
    token: { colorBgContainer }
  } = theme.useToken()

  const menuItems = [
    {
      key: '/specimen',
      icon: <FileTextOutlined />,
      label: '标本管理',
      children: [
        { key: '/specimen/list', label: '标本列表' },
        { key: '/specimen/create', label: '新增标本' }
      ]
    },
    {
      key: '/annotation',
      icon: <PictureOutlined />,
      label: '影像标注'
    },
    {
      key: '/traceability',
      icon: <LinkOutlined />,
      label: '溯源管理',
      children: [
        { key: '/traceability/list', label: '溯源信息' },
        { key: '/traceability/chain', label: '溯源链' }
      ]
    },
    {
      key: '/team',
      icon: <TeamOutlined />,
      label: '团队管理',
      children: [
        { key: '/team/members', label: '成员管理' },
        { key: '/team/roles', label: '角色权限' }
      ]
    },
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '系统设置'
    }
  ]

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人中心'
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '账号设置'
    },
    {
      type: 'divider' as const
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout
    }
  ]

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key)
  }

  const getBreadcrumbs = () => {
    const pathSnippets = location.pathname.split('/').filter(Boolean)
    return pathSnippets.map((_, index) => {
      const url = `/${pathSnippets.slice(0, index + 1).join('/')}`
      const findLabel = (items: any[], path: string): string => {
        for (const item of items) {
          if (item.key === path) return item.label
          if (item.children) {
            const found = findLabel(item.children, path)
            if (found) return found
          }
        }
        return ''
      }
      return { key: url, title: findLabel(menuItems, url) }
    })
  }

  return (
    <Layout className={styles.mainLayout}>
      <Sider
        trigger={null}
        collapsible
        collapsed={sidebarCollapsed}
        className={styles.sider}
      >
        <div className={styles.logo}>
          <AppstoreOutlined />
          {!sidebarCollapsed && <span>标本系统</span>}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer }} className={styles.header}>
          <div className={styles.headerLeft}>
            {React.createElement(
              sidebarCollapsed ? MenuUnfoldOutlined : MenuFoldOutlined,
              {
                className: styles.trigger,
                onClick: () => dispatch(toggleSidebar())
              }
            )}
            <Breadcrumb className={styles.breadcrumb}>
              <Breadcrumb.Item>首页</Breadcrumb.Item>
              {getBreadcrumbs().map(item => (
                <Breadcrumb.Item key={item.key}>{item.title}</Breadcrumb.Item>
              ))}
            </Breadcrumb>
          </div>
          <div className={styles.headerRight}>
            <Dropdown menu={{ items: userMenuItems }} placement="bottomRight">
              <div className={styles.userInfo}>
                <Avatar size="small" icon={<UserOutlined />} />
                <span>{user?.nickname || user?.username}</span>
              </div>
            </Dropdown>
          </div>
        </Header>
        <Content className={styles.content}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}

export default MainLayout

import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import type { UserRole } from '@/types'
import { useUserStore } from '@/store/user'
import { ElMessage } from 'element-plus'

const Layout = () => import('@/layout/Layout.vue')
const Login = () => import('@/views/Login.vue')
const Dashboard = () => import('@/views/Dashboard.vue')
const Topology = () => import('@/views/Topology.vue')
const TopologyDetail = () => import('@/views/TopologyDetail.vue')
const Rooms = () => import('@/views/Rooms.vue')
const RoomDetail = () => import('@/views/RoomDetail.vue')
const Audit = () => import('@/views/Audit.vue')
const Settings = () => import('@/views/Settings.vue')
const SettingsUsers = () => import('@/views/SettingsUsers.vue')
const SettingsAlarm = () => import('@/views/SettingsAlarm.vue')
const NotFound = () => import('@/views/NotFound.vue')

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: {
      title: '登录',
      public: true
    }
  },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    meta: {
      requiresAuth: true
    },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: Dashboard,
        meta: {
          title: '节点总览',
          icon: 'DataAnalysis',
          permissions: ['node:view', 'room:view']
        }
      },
      {
        path: 'topology',
        name: 'Topology',
        component: Topology,
        meta: {
          title: '节点链路',
          icon: 'Connection',
          permissions: ['node:view']
        },
        children: [
          {
            path: ':id',
            name: 'TopologyDetail',
            component: TopologyDetail,
            meta: {
              title: '节点详情',
              permissions: ['node:view'],
              hidden: true
            }
          }
        ]
      },
      {
        path: 'rooms',
        name: 'Rooms',
        component: Rooms,
        meta: {
          title: '机房管理',
          icon: 'OfficeBuilding',
          permissions: ['room:view']
        },
        children: [
          {
            path: ':id',
            name: 'RoomDetail',
            component: RoomDetail,
            meta: {
              title: '机房详情',
              permissions: ['room:view'],
              hidden: true
            }
          }
        ]
      },
      {
        path: 'audit',
        name: 'Audit',
        component: Audit,
        meta: {
          title: '操作溯源',
          icon: 'Document',
          permissions: ['audit:view']
        }
      },
      {
        path: 'settings',
        name: 'Settings',
        component: Settings,
        redirect: '/settings/users',
        meta: {
          title: '系统配置',
          icon: 'Setting',
          role: 'admin' as UserRole
        },
        children: [
          {
            path: 'users',
            name: 'SettingsUsers',
            component: SettingsUsers,
            meta: {
              title: '用户管理',
              role: 'admin' as UserRole
            }
          },
          {
            path: 'alarm',
            name: 'SettingsAlarm',
            component: SettingsAlarm,
            meta: {
              title: '告警配置',
              role: 'admin' as UserRole
            }
          }
        ]
      }
    ]
  },
  {
    path: '/404',
    name: 'NotFound',
    component: NotFound,
    meta: {
      title: '页面不存在',
      public: true
    }
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/404'
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior: () => ({ top: 0 })
})

const whiteList = ['/login', '/404']

router.beforeEach(async (to, from, next) => {
  const userStore = useUserStore()
  userStore.initFromStorage()

  document.title = to.meta.title 
    ? `${to.meta.title} - ${import.meta.env.VITE_APP_TITLE}` 
    : import.meta.env.VITE_APP_TITLE

  if (to.meta.public || whiteList.includes(to.path)) {
    if (to.path === '/login' && userStore.isLoggedIn) {
      next('/dashboard')
      return
    }
    next()
    return
  }

  if (!userStore.isLoggedIn) {
    ElMessage.warning('请先登录')
    next(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
    return
  }

  if (!userStore.userInfo) {
    try {
      await userStore.fetchUserInfo()
    } catch (error) {
      userStore.logout()
      next(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
      return
    }
  }

  if (to.meta.role && userStore.role !== to.meta.role) {
    ElMessage.error('无权限访问')
    next('/dashboard')
    return
  }

  if (to.meta.permissions && Array.isArray(to.meta.permissions)) {
    const hasPermission = to.meta.permissions.some(p => userStore.hasPermission(p))
    if (!hasPermission) {
      ElMessage.error('无权限访问')
      next('/dashboard')
      return
    }
  }

  next()
})

router.afterEach((to, from) => {
  // 可以在这里添加页面切换动画或埋点
})

export default router

import { createRouter, createWebHistory } from 'vue-router'
import MonitorPage from '@/pages/MonitorPage.vue'
import DashboardPage from '@/pages/DashboardPage.vue'
import ControlPage from '@/pages/ControlPage.vue'
import AlarmPage from '@/pages/AlarmPage.vue'
import SettingsPage from '@/pages/SettingsPage.vue'

const routes = [
  {
    path: '/',
    redirect: '/monitor'
  },
  {
    path: '/monitor',
    name: 'monitor',
    component: MonitorPage,
    meta: { title: '监控大屏' }
  },
  {
    path: '/dashboard',
    name: 'dashboard',
    component: DashboardPage,
    meta: { title: '数据仪表盘' }
  },
  {
    path: '/control',
    name: 'control',
    component: ControlPage,
    meta: { title: '设备控制' }
  },
  {
    path: '/alarm',
    name: 'alarm',
    component: AlarmPage,
    meta: { title: '告警中心' }
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsPage,
    meta: { title: '系统设置' }
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || '船舶监控平台'} - 船舶舱内传感数据联动监控系统`
  next()
})

export default router

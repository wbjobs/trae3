import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'Topology',
    component: () => import('../views/TopologyView.vue')
  },
  {
    path: '/alerts',
    name: 'Alerts',
    component: () => import('../views/AlertsView.vue')
  },
  {
    path: '/devices',
    name: 'Devices',
    component: () => import('../views/DevicesView.vue')
  },
  {
    path: '/strategies',
    name: 'Strategies',
    component: () => import('../views/StrategiesView.vue')
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

export default router

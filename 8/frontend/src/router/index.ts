import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import Login from '@/pages/LoginPage.vue'
import Dashboard from '@/pages/DashboardPage.vue'
import Documents from '@/pages/DocumentsPage.vue'
import Search from '@/pages/SearchPage.vue'
import Chat from '@/pages/ChatPage.vue'
import Users from '@/pages/UsersPage.vue'
import AppLayout from '@/components/AppLayout.vue'

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: Login,
  },
  {
    path: '/',
    component: AppLayout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', name: 'dashboard', component: Dashboard },
      { path: 'documents', name: 'documents', component: Documents },
      { path: 'search', name: 'search', component: Search },
      { path: 'chat', name: 'chat', component: Chat },
      { path: 'users', name: 'users', component: Users, meta: { requiresAdmin: true } },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, _from, next) => {
  const token = localStorage.getItem('token')
  if (to.path !== '/login' && !token) {
    next('/login')
  } else if (to.path === '/login' && token) {
    next('/dashboard')
  } else {
    next()
  }
})

export default router

import { createRouter, createWebHistory, RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Login.vue'),
  },
  {
    path: '/',
    component: () => import('@/layouts/MainLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        redirect: '/dashboard',
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/views/Dashboard.vue'),
      },
      {
        path: 'upload',
        name: 'Upload',
        component: () => import('@/views/FileUpload.vue'),
      },
      {
        path: 'files',
        name: 'Files',
        component: () => import('@/views/FileList.vue'),
      },
      {
        path: 'search',
        name: 'Search',
        component: () => import('@/views/SemanticSearch.vue'),
      },
      {
        path: 'qa',
        name: 'QA',
        component: () => import('@/views/AIQa.vue'),
      },
      {
        path: 'desensitize/:fileId',
        name: 'DesensitizePreview',
        component: () => import('@/views/DesensitizePreview.vue'),
      },
    ],
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const authStore = useAuthStore();
  if (to.meta.requiresAuth && !authStore.token) {
    next('/login');
  } else if (to.path === '/login' && authStore.token) {
    next('/');
  } else {
    next();
  }
});

export default router;

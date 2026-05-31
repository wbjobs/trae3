import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/projects'
  },
  {
    path: '/projects',
    name: 'Projects',
    component: () => import('@/views/ProjectManager.vue'),
    meta: { title: '工程管理', icon: 'Folder' }
  },
  {
    path: '/build',
    name: 'Build',
    component: () => import('@/views/BatchBuilder.vue'),
    meta: { title: '批量编译', icon: 'Operation' }
  },
  {
    path: '/diff',
    name: 'Diff',
    component: () => import('@/views/VersionDiff.vue'),
    meta: { title: '版本对比', icon: 'Comparison' }
  },
  {
    path: '/remote',
    name: 'Remote',
    component: () => import('@/views/RemoteService.vue'),
    meta: { title: '远程服务', icon: 'Connection' }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/views/Settings.vue'),
    meta: { title: '系统设置', icon: 'Setting' }
  }
];

const router = createRouter({
  history: createWebHashHistory(),
  routes
});

router.beforeEach((to, _from, next) => {
  document.title = `${to.meta.title || '固件管理系统'} - 工业嵌入式固件批量编译与版本管控`;
  next();
});

export default router;

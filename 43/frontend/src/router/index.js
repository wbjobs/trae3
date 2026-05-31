import { createRouter, createWebHistory } from 'vue-router'
import { ElMessage } from 'element-plus'
import MainLayout from '@/layouts/MainLayout.vue'
import Login from '@/views/Login.vue'

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { title: '登录' }
  },
  {
    path: '/',
    component: MainLayout,
    redirect: '/apply',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'apply',
        name: 'Apply',
        component: () => import('@/views/apply/ApplyForm.vue'),
        meta: { title: '领用申请', icon: 'Edit' }
      },
      {
        path: 'apply/my',
        name: 'MyApply',
        component: () => import('@/views/apply/MyApplication.vue'),
        meta: { title: '我的申请', icon: 'Document' }
      },
      {
        path: 'ledger',
        name: 'Ledger',
        component: () => import('@/views/ledger/LedgerList.vue'),
        meta: { title: '台账查询', icon: 'Notebook' }
      },
      {
        path: 'approval',
        name: 'Approval',
        component: () => import('@/views/approval/PendingApproval.vue'),
        meta: { title: '待我审批', icon: 'Check' }
      },
      {
        path: 'inventory/warning',
        name: 'InventoryWarning',
        component: () => import('@/views/inventory/StockWarning.vue'),
        meta: { title: '库存预警', icon: 'Warning' }
      },
      {
        path: 'system/user',
        name: 'SystemUser',
        component: () => import('@/views/system/UserManagement.vue'),
        meta: { title: '用户管理', icon: 'User' }
      },
      {
        path: 'system/role',
        name: 'SystemRole',
        component: () => import('@/views/system/RoleManagement.vue'),
        meta: { title: '角色管理', icon: 'Setting' }
      },
      {
        path: 'system/permission',
        name: 'SystemPermission',
        component: () => import('@/views/system/PermissionManagement.vue'),
        meta: { title: '权限列表', icon: 'Key' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

router.beforeEach((to, from, next) => {
  const token = localStorage.getItem('token')
  
  if (to.meta.title) {
    document.title = `${to.meta.title} - 危化品申领系统`
  }

  if (to.meta.requiresAuth) {
    if (!token) {
      ElMessage.warning('请先登录')
      next('/login')
    } else {
      next()
    }
  } else if (to.path === '/login' && token) {
    next('/')
  } else {
    next()
  }
})

export default router

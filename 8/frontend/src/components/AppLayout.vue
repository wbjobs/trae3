<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import {
  LayoutDashboard,
  FileText,
  Search,
  MessageSquare,
  Users,
  LogOut,
  Menu,
  X,
  BookOpen,
} from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const sidebarOpen = ref(true)

const navItems = computed(() => {
  const items = [
    { path: '/dashboard', label: '仪表盘', icon: LayoutDashboard },
    { path: '/documents', label: '文档管理', icon: FileText },
    { path: '/search', label: '语义检索', icon: Search },
    { path: '/chat', label: '智能问答', icon: MessageSquare },
  ]
  if (authStore.isAdmin()) {
    items.push({ path: '/users', label: '用户管理', icon: Users })
  }
  return items
})

function handleLogout() {
  authStore.logout()
  router.push('/login')
}

onMounted(() => {
  authStore.fetchUser()
})
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <aside
      :class="[
        'flex flex-col bg-slate-900 border-r border-slate-700/50 transition-all duration-300',
        sidebarOpen ? 'w-64' : 'w-0 overflow-hidden',
      ]"
    >
      <div class="flex items-center gap-3 px-6 py-5 border-b border-slate-700/50">
        <BookOpen class="w-8 h-8 text-blue-400" />
        <div>
          <h1 class="text-lg font-bold text-white tracking-tight">DocuSem AI</h1>
          <p class="text-xs text-slate-400">文档语义检索平台</p>
        </div>
      </div>

      <nav class="flex-1 px-3 py-4 space-y-1">
        <router-link
          v-for="item in navItems"
          :key="item.path"
          :to="item.path"
          :class="[
            'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-sm font-medium',
            route.path === item.path
              ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
          ]"
        >
          <component :is="item.icon" class="w-5 h-5" />
          <span>{{ item.label }}</span>
        </router-link>
      </nav>

      <div class="px-3 py-4 border-t border-slate-700/50">
        <div class="flex items-center gap-3 px-3 py-2 mb-2">
          <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
            <span class="text-sm font-bold text-blue-400">
              {{ authStore.user?.username?.charAt(0)?.toUpperCase() || 'U' }}
            </span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-slate-200 truncate">{{ authStore.user?.username }}</p>
            <p class="text-xs text-slate-500">{{ authStore.user?.role === 'admin' ? '管理员' : '普通用户' }}</p>
          </div>
        </div>
        <button
          @click="handleLogout"
          class="flex items-center gap-3 px-3 py-2.5 rounded-lg w-full text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all duration-200 text-sm"
        >
          <LogOut class="w-5 h-5" />
          <span>退出登录</span>
        </button>
      </div>
    </aside>

    <div class="flex-1 flex flex-col overflow-hidden">
      <header class="flex items-center gap-4 px-6 py-3 bg-slate-900/50 border-b border-slate-700/50 backdrop-blur-sm">
        <button
          @click="sidebarOpen = !sidebarOpen"
          class="p-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
        >
          <Menu v-if="!sidebarOpen" class="w-5 h-5" />
          <X v-else class="w-5 h-5" />
        </button>
        <h2 class="text-lg font-semibold text-slate-200">
          {{ navItems.find(i => i.path === route.path)?.label || 'DocuSem AI' }}
        </h2>
      </header>
      <main class="flex-1 overflow-auto p-6 bg-slate-950">
        <router-view />
      </main>
    </div>
  </div>
</template>

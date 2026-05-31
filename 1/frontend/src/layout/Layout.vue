<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useUserStore } from '@/store/user'
import { useAppStore } from '@/store/app'
import {
  Menu,
  BarChart3,
  Link,
  Building2,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  ToggleLeft,
  Bell,
  Maximize,
  ChevronDown
} from 'lucide-vue-next'
import type { RouteRecordRaw } from 'vue-router'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const appStore = useAppStore()

const userDropdownVisible = ref(false)

const menuItems = computed(() => {
  const mainRoute = router.getRoutes().find(r => r.path === '/')
  if (!mainRoute || !mainRoute.children) return []
  
  return mainRoute.children.filter(r => {
    if (r.meta?.hidden) return false
    if (r.meta?.role && userStore.role !== r.meta.role) return false
    if (r.meta?.permissions && Array.isArray(r.meta.permissions)) {
      return r.meta.permissions.some(p => userStore.hasPermission(p))
    }
    return true
  })
})

const activeMenu = computed(() => {
  const path = route.path.split('/').slice(0, 3).join('/')
  return path
})

function handleMenuSelect(index: string) {
  router.push(index)
}

function toggleSidebar() {
  appStore.toggleSidebar()
}

function handleLogout() {
  userStore.logout()
}

function toggleEnvironment() {
  const newEnv = userStore.environment === 'production' ? 'development' : 'production'
  userStore.setEnvironment(newEnv)
  appStore.setEnv(newEnv)
}

function fullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
  } else {
    document.exitFullscreen()
  }
}

const roleText = computed(() => {
  const roles: Record<string, string> = {
    admin: '系统管理员',
    operator: '运维工程师',
    viewer: '只读用户'
  }
  return roles[userStore.role || ''] || '未知角色'
})
</script>

<template>
  <div class="layout-container h-screen flex bg-dark-bg text-dark-text overflow-hidden">
    <aside
      class="sidebar flex flex-col bg-dark-card border-r border-dark-border transition-all duration-300"
      :class="{ 'w-60': !appStore.sidebarCollapsed, 'w-16': appStore.sidebarCollapsed }"
    >
      <div class="logo h-16 flex items-center justify-center border-b border-dark-border px-4">
        <div v-if="!appStore.sidebarCollapsed" class="flex items-center gap-3">
          <div class="w-8 h-8 rounded bg-gradient-to-br from-accent-500 to-primary-500 flex items-center justify-center">
            <Link class="w-5 h-5 text-white" />
          </div>
          <span class="font-bold text-lg bg-gradient-to-r from-accent-400 to-accent-500 bg-clip-text text-transparent">
            节点溯源系统
          </span>
        </div>
        <div v-else class="w-8 h-8 rounded bg-gradient-to-br from-accent-500 to-primary-500 flex items-center justify-center">
          <Link class="w-5 h-5 text-white" />
        </div>
      </div>

      <div class="env-badge mx-4 my-3 p-2 rounded text-center text-xs"
           :style="`background-color: ${appStore.envColor}20; color: ${appStore.envColor}`">
        {{ appStore.envText }}
      </div>

      <el-menu
        class="flex-1 border-none bg-transparent"
        :default-active="activeMenu"
        :collapse="appStore.sidebarCollapsed"
        :collapse-transition="false"
        background-color="transparent"
        text-color="#E4E7EB"
        active-text-color="#00D4FF"
        @select="handleMenuSelect"
      >
        <el-menu-item
          v-for="item in menuItems"
          :key="'/' + item.path"
          :index="'/' + item.path"
          class="my-1 mx-2 rounded"
        >
          <component :is="getIcon(item.meta?.icon as string)" class="w-5 h-5" />
          <template #title>{{ item.meta?.title }}</template>
        </el-menu-item>
      </el-menu>

      <div class="p-4 border-t border-dark-border">
        <button
          class="w-full h-10 rounded hover:bg-dark-border flex items-center justify-center text-dark-textSecondary transition-colors"
          @click="toggleSidebar"
        >
          <ChevronLeft v-if="!appStore.sidebarCollapsed" class="w-5 h-5" />
          <ChevronRight v-else class="w-5 h-5" />
        </button>
      </div>
    </aside>

    <div class="main-content flex-1 flex flex-col overflow-hidden">
      <header class="header h-16 bg-dark-card border-b border-dark-border flex items-center justify-between px-6">
        <div class="flex items-center gap-4">
          <h2 class="text-lg font-medium">{{ route.meta?.title || '节点总览' }}</h2>
        </div>

        <div class="flex items-center gap-4">
          <el-badge :value="3" class="cursor-pointer">
            <Bell class="w-5 h-5 text-dark-textSecondary hover:text-accent-400 transition-colors" />
          </el-badge>

          <button
            class="p-2 rounded hover:bg-dark-border text-dark-textSecondary hover:text-accent-400 transition-colors"
            @click="toggleEnvironment"
            :title="`切换到${userStore.environment === 'production' ? '测试' : '生产'}环境`"
          >
            <ToggleLeft class="w-5 h-5" />
          </button>

          <button
            class="p-2 rounded hover:bg-dark-border text-dark-textSecondary hover:text-accent-400 transition-colors"
            @click="fullscreen"
            title="全屏"
          >
            <Maximize class="w-5 h-5" />
          </button>

          <el-dropdown
            v-model:visible="userDropdownVisible"
            trigger="click"
            @command="(cmd: string) => cmd === 'logout' && handleLogout()"
          >
            <div class="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-dark-border transition-colors">
              <div class="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
                <User class="w-4 h-4 text-white" />
              </div>
              <div v-if="!appStore.sidebarCollapsed" class="text-sm">
                <div class="font-medium">{{ userStore.userInfo?.username }}</div>
                <div class="text-xs text-dark-textSecondary">{{ roleText }}</div>
              </div>
              <ChevronDown class="w-4 h-4 text-dark-textSecondary" />
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item disabled>
                  <div class="text-sm">
                    <div class="font-medium">{{ userStore.userInfo?.username }}</div>
                    <div class="text-xs text-gray-400">{{ roleText }}</div>
                  </div>
                </el-dropdown-item>
                <el-dropdown-item divided command="logout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </header>

      <main class="flex-1 overflow-auto p-6">
        <router-view v-slot="{ Component }">
          <transition name="fade-slide" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script lang="ts">
import {
  BarChart3 as DataAnalysisIcon,
  Link as ConnectionIcon,
  Building2 as OfficeBuildingIcon,
  FileText as DocumentIcon,
  Settings as SettingIcon
} from 'lucide-vue-next'

export default {
  methods: {
    getIcon(name: string) {
      const icons: Record<string, any> = {
        DataAnalysis: DataAnalysisIcon,
        Connection: ConnectionIcon,
        OfficeBuilding: OfficeBuildingIcon,
        Document: DocumentIcon,
        Setting: SettingIcon
      }
      return icons[name] || DataAnalysisIcon
    }
  }
}
</script>

<style scoped>
.fade-slide-enter-active,
.fade-slide-leave-active {
  transition: all 0.3s ease;
}

.fade-slide-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.fade-slide-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}

.el-menu-item.is-active {
  background-color: rgba(0, 212, 255, 0.1) !important;
}

.el-menu-item:hover {
  background-color: rgba(0, 212, 255, 0.05) !important;
}
</style>

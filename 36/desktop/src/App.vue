<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useConfigStore } from '@/stores/configStore';
import { useProjectStore } from '@/stores/projectStore';
import { httpClient } from '@/api/httpClient';
import { ElMessage } from 'element-plus';
import { usePlatform } from '@/composables/usePlatform';

const route = useRoute();
const router = useRouter();
const configStore = useConfigStore();
const projectStore = useProjectStore();
const { platform, sidebarWidth, titleBarHeight, layoutMode, showSidebarLabels, contentPadding } = usePlatform();

const isLoading = ref(true);
const menuItems = [
  { path: '/projects', title: '工程管理', icon: 'Folder' },
  { path: '/build', title: '批量编译', icon: 'Operation' },
  { path: '/diff', title: '版本对比', icon: 'Comparison' },
  { path: '/remote', title: '远程服务', icon: 'Connection' },
  { path: '/settings', title: '系统设置', icon: 'Setting' }
];

async function initApp() {
  try {
    await configStore.loadConfig();
    await projectStore.loadProjects();
    configStore.applyTheme(configStore.config.theme);
    
    try {
      const health = await httpClient.healthCheck();
      configStore.setConnected(true);
      ElMessage.success(`已连接到后端服务 v${health.version}`);
    } catch {
      configStore.setConnected(false);
      ElMessage.warning('未连接到后端服务，请检查设置');
    }
  } catch (error) {
    console.error('Failed to init app:', error);
    ElMessage.error('应用初始化失败');
  } finally {
    isLoading.value = false;
  }
}

function handleMenuClick(item: typeof menuItems[0]) {
  router.push(item.path);
}

function isActive(path: string) {
  return route.path === path;
}

function handleMinimize() {
  window.electronAPI.window.minimize();
}

function handleMaximize() {
  window.electronAPI.window.maximize();
}

function handleClose() {
  window.electronAPI.window.close();
}

const appStyle = computed(() => ({
  '--sidebar-width': `${sidebarWidth.value}px`,
  '--title-bar-height': `${titleBarHeight.value}px`,
  '--content-padding': contentPadding.value
}));

const sidebarStyle = computed(() => ({
  width: `${sidebarWidth.value}px`
}));

const titleBarStyle = computed(() => ({
  height: `${titleBarHeight.value}px`
}));

onMounted(() => {
  initApp();
});
</script>

<template>
  <div v-loading="isLoading" class="app-container" :style="appStyle" :class="[`layout-${layoutMode}`, `platform-${platform.platform}`]">
    <div class="title-bar" :style="titleBarStyle" :class="{ 'mac-style': platform.isMac }">
      <div class="title-bar-left">
        <el-icon size="18" class="logo-icon"><Cpu /></el-icon>
        <span class="app-title" v-if="!platform.isCompact">固件批量编译与版本管控系统</span>
      </div>
      <div class="title-bar-right">
        <el-badge :value="configStore.isConnected ? '' : '!'">
          <el-button
            :type="configStore.isConnected ? 'success' : 'warning'"
            size="small"
            plain
            circle
            @click="router.push('/remote')"
          >
            <el-icon><Connection /></el-icon>
          </el-button>
        </el-badge>
        <span class="project-count" v-if="!platform.isCompact">工程: {{ projectStore.projectCount }}</span>
        <div class="window-controls" v-if="!platform.isMac">
          <el-button size="small" text @click="handleMinimize">
            <el-icon><Minus /></el-icon>
          </el-button>
          <el-button size="small" text @click="handleMaximize">
            <el-icon><Crop /></el-icon>
          </el-button>
          <el-button size="small" text class="close-btn" @click="handleClose">
            <el-icon><Close /></el-icon>
          </el-button>
        </div>
      </div>
    </div>

    <div class="main-content">
      <aside class="sidebar" :style="sidebarStyle">
        <div class="nav-menu">
          <div
            v-for="item in menuItems"
            :key="item.path"
            class="nav-item"
            :class="{ active: isActive(item.path), 'icon-only': !showSidebarLabels }"
            @click="handleMenuClick(item)"
            :title="item.title"
          >
            <el-icon :size="20">
              <component :is="item.icon" />
            </el-icon>
            <span v-if="showSidebarLabels" class="nav-label">{{ item.title }}</span>
          </div>
        </div>

        <div class="sidebar-footer">
          <div class="stats-card" v-if="showSidebarLabels">
            <div class="stat-item">
              <el-icon color="#67c23a"><CircleCheck /></el-icon>
              <span>{{ projectStore.successBuildCount }} 成功</span>
            </div>
            <div class="stat-item">
              <el-icon color="#f56c6c"><CircleClose /></el-icon>
              <span>{{ projectStore.failedBuildCount }} 失败</span>
            </div>
          </div>
          <div class="stats-mini" v-else>
            <el-icon color="#67c23a"><CircleCheck /></el-icon>
            <span>{{ projectStore.successBuildCount }}</span>
            <el-icon color="#f56c6c"><CircleClose /></el-icon>
            <span>{{ projectStore.failedBuildCount }}</span>
          </div>
        </div>
      </aside>

      <main class="content-area" :style="{ padding: contentPadding }">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--el-bg-color);
  color: var(--el-text-color-primary);
}

.title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--el-bg-color-page);
  border-bottom: 1px solid var(--el-border-color-lighter);
  -webkit-app-region: drag;
  user-select: none;
  flex-shrink: 0;
}

.title-bar.mac-style {
  padding-left: 76px;
}

.title-bar-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  color: var(--el-color-primary);
}

.app-title {
  font-size: 14px;
  font-weight: 600;
}

.title-bar-right {
  display: flex;
  align-items: center;
  gap: 16px;
  -webkit-app-region: no-drag;
}

.project-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 12px;
  background: var(--el-fill-color-light);
  border-radius: 12px;
}

.window-controls {
  display: flex;
  gap: 4px;
}

.close-btn {
  color: var(--el-text-color-primary);
}

.close-btn:hover {
  background: var(--el-color-danger) !important;
  color: white;
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  background: var(--el-bg-color-page);
  border-right: 1px solid var(--el-border-color-lighter);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.2s ease;
  overflow: hidden;
}

.nav-menu {
  flex: 1;
  padding: 16px 8px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
}

.nav-item:hover {
  background: var(--el-fill-color-light);
}

.nav-item.active {
  background: var(--el-color-primary);
  color: white;
}

.nav-item.active .el-icon {
  color: white;
}

.nav-item.icon-only {
  justify-content: center;
  padding: 12px 8px;
}

.nav-label {
  overflow: hidden;
  text-overflow: ellipsis;
}

.sidebar-footer {
  padding: 16px;
  border-top: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
}

.stats-card {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  font-size: 13px;
}

.stats-mini {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 11px;
}

.content-area {
  flex: 1;
  overflow: auto;
}

.layout-compact .content-area {
  overflow-y: auto;
}

.layout-mobile .sidebar {
  width: 60px !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

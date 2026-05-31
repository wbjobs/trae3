<template>
  <el-container class="main-layout">
    <el-aside width="240px" class="sidebar">
      <div class="logo">
        <el-icon size="32" color="#409eff"><Lock /></el-icon>
        <span class="logo-text">涉密文件智能<br />脱敏检索系统</span>
      </div>
      <el-menu
        :default-active="activeMenu"
        router
        background-color="#001529"
        text-color="#fff"
        active-text-color="#409eff"
      >
        <el-menu-item index="/dashboard">
          <el-icon><DataLine /></el-icon>
          <span>数据概览</span>
        </el-menu-item>
        <el-menu-item index="/upload">
          <el-icon><Upload /></el-icon>
          <span>文件上传处理</span>
        </el-menu-item>
        <el-menu-item index="/files">
          <el-icon><Folder /></el-icon>
          <span>文件管理</span>
        </el-menu-item>
        <el-menu-item index="/search">
          <el-icon><Search /></el-icon>
          <span>语义检索</span>
        </el-menu-item>
        <el-menu-item index="/qa">
          <el-icon><ChatDotRound /></el-icon>
          <span>智能问答</span>
        </el-menu-item>
        <el-menu-item
          v-if="authStore.isAdmin"
          index="/admin"
        >
          <el-icon><Setting /></el-icon>
          <span>系统管理</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item>{{ currentPage }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-dropdown trigger="click" @command="handleCommand">
            <div class="user-info">
              <el-avatar :size="32" style="background: #409eff">
                {{ authStore.user?.displayName?.charAt(0) || 'U' }}
              </el-avatar>
              <span class="username">{{ authStore.user?.displayName }}</span>
              <el-tag :type="roleTagType" size="small">{{ roleName }}</el-tag>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="profile">
                  <el-icon><User /></el-icon>个人中心
                </el-dropdown-item>
                <el-dropdown-item command="logout" divided>
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main-content">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useAuthStore } from '@/stores/auth';
import {
  Lock,
  DataLine,
  Upload,
  Folder,
  Search,
  ChatDotRound,
  Setting,
  User,
  SwitchButton,
} from '@element-plus/icons-vue';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const activeMenu = computed(() => route.path);

const pageNames: Record<string, string> = {
  '/dashboard': '数据概览',
  '/upload': '文件上传处理',
  '/files': '文件管理',
  '/search': '语义检索',
  '/qa': '智能问答',
  '/admin': '系统管理',
};

const currentPage = computed(() => {
  for (const [path, name] of Object.entries(pageNames)) {
    if (route.path.startsWith(path)) return name;
  }
  return '页面';
});

const roleName = computed(() => {
  const map: Record<string, string> = {
    admin: '管理员',
    analyst: '分析师',
    viewer: '查看员',
  };
  return map[authStore.user?.role || ''] || '';
});

const roleTagType = computed(() => {
  const map: Record<string, string> = {
    admin: 'danger',
    analyst: 'warning',
    viewer: 'info',
  };
  return map[authStore.user?.role || ''] || 'info';
});

async function handleCommand(cmd: string) {
  if (cmd === 'logout') {
    try {
      await ElMessageBox.confirm('确定要退出登录吗？', '提示', {
        type: 'warning',
      });
      authStore.logout();
      ElMessage.success('已退出登录');
      router.push('/login');
    } catch {}
  } else if (cmd === 'profile') {
    ElMessage.info('个人中心功能开发中');
  }
}
</script>

<style scoped>
.main-layout {
  height: 100%;
}

.sidebar {
  background: #001529;
  display: flex;
  flex-direction: column;
}

.logo {
  height: 100px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-bottom: 1px solid #1f3a57;
}

.logo-text {
  color: white;
  font-size: 14px;
  font-weight: bold;
  line-height: 1.4;
}

.sidebar :deep(.el-menu) {
  border-right: none;
}

.header {
  background: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  border-bottom: 1px solid #e4e7ed;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.username {
  font-size: 14px;
  color: #303133;
}

.main-content {
  background: #f0f2f5;
  overflow: auto;
}
</style>

<template>
  <el-container class="app-container">
    <el-header class="app-header">
      <div class="header-title">
        <el-icon><Connection /></el-icon>
        <span>工业无线组网拓扑监测联动系统</span>
      </div>
      <div class="header-info">
        <el-tag :type="envType === 'production' ? 'danger' : 'success'" size="small">
          {{ envType === 'production' ? '生产环境' : '测试环境' }}
        </el-tag>
        <span class="current-time">{{ currentTime }}</span>
      </div>
    </el-header>
    
    <el-container>
      <el-aside width="200px" class="app-aside">
        <el-menu
          :default-active="activeMenu"
          router
          background-color="#304156"
          text-color="#bfcbd9"
          active-text-color="#409EFF"
        >
          <el-menu-item index="/">
            <el-icon><Monitor /></el-icon>
            <span>拓扑监控</span>
          </el-menu-item>
          <el-menu-item index="/alerts">
            <el-icon><Warning /></el-icon>
            <span>告警中心</span>
            <el-badge :value="alertCount" :hidden="alertCount === 0" class="menu-badge" />
          </el-menu-item>
          <el-menu-item index="/devices">
            <el-icon><Cpu /></el-icon>
            <span>设备管理</span>
          </el-menu-item>
          <el-menu-item index="/strategies">
            <el-icon><Setting /></el-icon>
            <span>联动策略</span>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <el-main class="app-main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Connection, Monitor, Warning, Cpu, Setting } from '@element-plus/icons-vue'
import { alertApi } from './api'

const route = useRoute()
const activeMenu = ref('/')
const currentTime = ref('')
const alertCount = ref(0)
const envType = import.meta.env.MODE

let timeTimer = null
let alertTimer = null

const updateTime = () => {
  const now = new Date()
  currentTime.value = now.toLocaleString('zh-CN')
}

const fetchAlertCount = async () => {
  try {
    const res = await alertApi.getStats()
    if (res.success) {
      alertCount.value = (res.data.critical || 0) + (res.data.warning || 0)
    }
  } catch (e) {
    console.error('获取告警数量失败', e)
  }
}

onMounted(() => {
  activeMenu.value = route.path
  updateTime()
  timeTimer = setInterval(updateTime, 1000)
  fetchAlertCount()
  alertTimer = setInterval(fetchAlertCount, 10000)
})

onUnmounted(() => {
  if (timeTimer) clearInterval(timeTimer)
  if (alertTimer) clearInterval(alertTimer)
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #app {
  width: 100%;
  height: 100%;
}

.app-container {
  height: 100%;
}

.app-header {
  background: linear-gradient(90deg, #2b5876 0%, #4e4376 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 20px;
  font-weight: bold;
}

.header-info {
  display: flex;
  align-items: center;
  gap: 15px;
}

.current-time {
  font-size: 14px;
}

.app-aside {
  background: #304156;
}

.app-main {
  background: #f0f2f5;
  padding: 20px;
}

.menu-badge {
  margin-left: 10px;
}
</style>

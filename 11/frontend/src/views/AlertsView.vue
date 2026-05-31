<template>
  <div class="alerts-view">
    <el-row :gutter="20">
      <el-col :span="6">
        <el-card shadow="never" class="stat-card critical">
          <div class="stat-icon">
            <el-icon :size="32"><CircleClose /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.critical || 0 }}</div>
            <div class="stat-label">严重告警</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card warning">
          <div class="stat-icon">
            <el-icon :size="32"><Warning /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.warning || 0 }}</div>
            <div class="stat-label">警告告警</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card info">
          <div class="stat-icon">
            <el-icon :size="32"><InfoFilled /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ stats.info || 0 }}</div>
            <div class="stat-label">提示信息</div>
          </div>
        </el-card>
      </el-col>
      <el-col :span="6">
        <el-card shadow="never" class="stat-card total">
          <div class="stat-icon">
            <el-icon :size="32"><Bell /></el-icon>
          </div>
          <div class="stat-content">
            <div class="stat-value">{{ totalAlerts }}</div>
            <div class="stat-label">告警总数</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card shadow="never" style="margin-top: 20px;">
      <template #header>
        <div class="card-header">
          <div class="header-left">
            <span class="card-title">告警列表</span>
            <el-badge v-if="unreadCount > 0" :value="unreadCount" class="unread-badge">
              <el-button type="primary" size="small" @click="fetchAlerts">
                <el-icon><Refresh /></el-icon>
                刷新
              </el-button>
            </el-badge>
          </div>
          <div class="header-actions">
            <el-select v-model="filterStatus" placeholder="状态筛选" style="width: 120px;" size="small" @change="fetchAlerts">
              <el-option label="全部" value="" />
              <el-option label="未处理" value="active" />
              <el-option label="已解决" value="resolved" />
            </el-select>
            <el-select v-model="filterSeverity" placeholder="级别筛选" style="width: 120px;" size="small" @change="fetchAlerts">
              <el-option label="全部" value="" />
              <el-option label="严重" value="critical" />
              <el-option label="警告" value="warning" />
              <el-option label="提示" value="info" />
            </el-select>
          </div>
        </div>
      </template>

      <el-table 
        :data="alerts" 
        style="width: 100%;" 
        v-loading="loading"
        row-key="alert_id"
        @row-click="handleRowClick"
      >
        <el-table-column prop="alert_id" label="告警ID" width="140" />
        <el-table-column prop="device_id" label="设备ID" width="140" />
        <el-table-column prop="alert_type" label="告警类型" width="120">
          <template #default="{ row }">
            <el-tag size="small">{{ row.alert_type }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="severity" label="级别" width="100">
          <template #default="{ row }">
            <el-tag :type="getSeverityType(row.severity)" size="small">
              {{ getSeverityName(row.severity) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="告警信息" min-width="200" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'danger' : 'success'" size="small">
              {{ row.status === 'active' ? '未处理' : '已解决' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="triggered_at" label="触发时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.triggered_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'active'"
              type="success"
              size="small"
              @click.stop="resolveAlert(row.alert_id)"
            >
              处理
            </el-button>
            <el-button type="danger" size="small" @click.stop="deleteAlert(row.alert_id)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, Warning, InfoFilled, Bell, CircleClose } from '@element-plus/icons-vue'
import { alertApi } from '../api'
import wsClient from '../utils/websocket'

const alerts = ref([])
const stats = ref({ critical: 0, warning: 0, info: 0 })
const loading = ref(false)
const filterStatus = ref('')
const filterSeverity = ref('')
const unreadCount = ref(0)
const knownAlertIds = ref(new Set())

const totalAlerts = computed(() => stats.value.critical + stats.value.warning + stats.value.info)

const getSeverityType = (severity) => {
  const types = {
    critical: 'danger',
    warning: 'warning',
    info: 'info'
  }
  return types[severity] || 'info'
}

const getSeverityName = (severity) => {
  const names = {
    critical: '严重',
    warning: '警告',
    info: '提示'
  }
  return names[severity] || severity
}

const formatTime = (time) => {
  if (!time) return '-'
  const date = new Date(time)
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const fetchAlerts = async () => {
  loading.value = true
  try {
    let data
    if (filterSeverity.value) {
      const res = await alertApi.getBySeverity(filterSeverity.value)
      data = res.data
    } else if (filterStatus.value === 'active') {
      const res = await alertApi.getActive()
      data = res.data
    } else {
      const res = await alertApi.getAll()
      data = res.data
    }
    
    if (filterStatus.value) {
      alerts.value = data.filter(a => a.status === filterStatus.value)
    } else {
      alerts.value = data
    }

    data.forEach(alert => knownAlertIds.value.add(alert.alert_id))
    unreadCount.value = 0
  } catch (e) {
    ElMessage.error('获取告警列表失败')
  } finally {
    loading.value = false
  }
}

const fetchStats = async () => {
  try {
    const res = await alertApi.getStats()
    if (res.success) {
      stats.value = res.data
    }
  } catch (e) {
    console.error('获取告警统计失败', e)
  }
}

const handleNewAlert = (alert) => {
  if (!knownAlertIds.value.has(alert.alert_id)) {
    unreadCount.value++
    
    alerts.value.unshift(alert)
    if (alerts.value.length > 100) {
      alerts.value.pop()
    }
    
    if (alert.severity === 'critical') {
      stats.value.critical++
    } else if (alert.severity === 'warning') {
      stats.value.warning++
    } else {
      stats.value.info++
    }

    ElMessage({
      type: alert.severity === 'critical' ? 'error' : alert.severity === 'warning' ? 'warning' : 'info',
      message: `新告警: ${alert.message}`,
      duration: 5000,
      showClose: true
    })
  }
}

const resolveAlert = async (alertId) => {
  try {
    await ElMessageBox.confirm('确认处理此告警?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await alertApi.resolve(alertId)
    ElMessage.success('告警已处理')
    
    const alert = alerts.value.find(a => a.alert_id === alertId)
    if (alert) {
      alert.status = 'resolved'
      if (alert.severity === 'critical' && stats.value.critical > 0) {
        stats.value.critical--
      } else if (alert.severity === 'warning' && stats.value.warning > 0) {
        stats.value.warning--
      } else if (stats.value.info > 0) {
        stats.value.info--
      }
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('处理失败')
    }
  }
}

const deleteAlert = async (alertId) => {
  try {
    await ElMessageBox.confirm('确认删除此告警?', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await alertApi.delete(alertId)
    ElMessage.success('删除成功')
    
    const index = alerts.value.findIndex(a => a.alert_id === alertId)
    if (index > -1) {
      const alert = alerts.value[index]
      alerts.value.splice(index, 1)
      
      if (alert.status === 'active') {
        if (alert.severity === 'critical' && stats.value.critical > 0) {
          stats.value.critical--
        } else if (alert.severity === 'warning' && stats.value.warning > 0) {
          stats.value.warning--
        } else if (stats.value.info > 0) {
          stats.value.info--
        }
      }
    }
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

const handleRowClick = (row) => {
  if (row.status === 'active') {
    const index = alerts.value.findIndex(a => a.alert_id === row.alert_id)
    if (index > -1 && unreadCount.value > 0) {
      unreadCount.value--
    }
  }
}

let statsInterval = null

onMounted(() => {
  fetchAlerts()
  fetchStats()

  wsClient.connect()
  wsClient.on('alert_created', handleNewAlert)

  statsInterval = setInterval(() => {
    fetchStats()
  }, 5000)
})

onUnmounted(() => {
  wsClient.off('alert_created', handleNewAlert)
  if (statsInterval) {
    clearInterval(statsInterval)
  }
})
</script>

<style scoped>
.alerts-view {
  height: 100%;
}

.stat-card {
  display: flex;
  align-items: center;
  padding: 16px !important;
  border-left: 4px solid;
  transition: transform 0.2s;
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.stat-card.critical {
  border-left-color: #F56C6C;
}

.stat-card.warning {
  border-left-color: #E6A23C;
}

.stat-card.info {
  border-left-color: #409EFF;
}

.stat-card.total {
  border-left-color: #909399;
}

.stat-icon {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 16px;
}

.critical .stat-icon {
  background: rgba(245, 108, 108, 0.1);
  color: #F56C6C;
}

.warning .stat-icon {
  background: rgba(230, 162, 60, 0.1);
  color: #E6A23C;
}

.info .stat-icon {
  background: rgba(64, 158, 255, 0.1);
  color: #409EFF;
}

.total .stat-icon {
  background: rgba(144, 147, 153, 0.1);
  color: #909399;
}

.stat-content {
  flex: 1;
}

.stat-value {
  font-size: 28px;
  font-weight: bold;
  color: #303133;
  line-height: 1.2;
}

.stat-label {
  font-size: 14px;
  color: #909399;
  margin-top: 4px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.card-title {
  font-size: 16px;
  font-weight: bold;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.unread-badge {
  margin-left: 8px;
}

:deep(.el-table__row:hover) {
  background-color: #f5f7fa !important;
  cursor: pointer;
}
</style>

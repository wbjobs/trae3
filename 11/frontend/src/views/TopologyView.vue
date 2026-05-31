<template>
  <div class="topology-view">
    <el-row :gutter="20">
      <el-col :span="24">
        <el-card shadow="never">
          <template #header>
            <div class="card-header">
              <span class="card-title">网络拓扑监控</span>
              <div class="header-actions">
                <el-tag type="success" size="small">
                  在线: {{ summary.online || 0 }}
                </el-tag>
                <el-tag type="danger" size="small">
                  离线: {{ summary.offline || 0 }}
                </el-tag>
                <el-button type="primary" size="small" @click="refreshData">
                  <el-icon><Refresh /></el-icon>
                  刷新
                </el-button>
              </div>
            </div>
          </template>
          
          <el-row :gutter="20" class="stats-row">
            <el-col :span="6">
              <el-statistic title="设备总数" :value="summary.total || 0">
                <template #suffix>台</template>
              </el-statistic>
            </el-col>
            <el-col :span="6">
              <el-statistic title="核心AP" :value="summary.by_type?.ap || 0" value-style="color: #409EFF">
                <template #suffix>台</template>
              </el-statistic>
            </el-col>
            <el-col :span="6">
              <el-statistic title="中继节点" :value="summary.by_type?.repeater || 0" value-style="color: #E6A23C">
                <template #suffix>台</template>
              </el-statistic>
            </el-col>
            <el-col :span="6">
              <el-statistic title="终端设备" :value="summary.by_type?.endpoint || 0" value-style="color: #67C23A">
                <template #suffix>台</template>
              </el-statistic>
            </el-col>
          </el-row>
          
          <div class="topology-wrapper">
            <TopologyGraph
              :devices="devices"
              :links="links"
              @device-select="handleDeviceSelect"
            />
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Refresh } from '@element-plus/icons-vue'
import TopologyGraph from '../components/TopologyGraph.vue'
import { topologyApi } from '../api'
import wsClient from '../utils/websocket'

const devices = ref([])
const links = ref([])
const summary = ref({})

const fetchTopology = async () => {
  try {
    const res = await topologyApi.getTopology()
    if (res.success) {
      devices.value = res.data.devices
      links.value = res.data.links
    }
  } catch (e) {
    ElMessage.error('获取拓扑数据失败')
  }
}

const fetchSummary = async () => {
  try {
    const res = await topologyApi.getSummary()
    if (res.success) {
      summary.value = res.data
    }
  } catch (e) {
    console.error('获取统计数据失败', e)
  }
}

const refreshData = () => {
  fetchTopology()
  fetchSummary()
}

const handleDeviceSelect = (device) => {
  console.log('Selected device:', device)
}

const handleSignalUpdate = (data) => {
  devices.value = devices.value.map(device => {
    const updated = data.find(d => d.device_id === device.device_id)
    if (updated && updated.status) {
      return { ...device, status: updated.status }
    }
    return device
  })
}

onMounted(() => {
  refreshData()
  
  wsClient.connect()
  wsClient.on('signal_update', handleSignalUpdate)
})

onUnmounted(() => {
  wsClient.off('signal_update', handleSignalUpdate)
})
</script>

<style scoped>
.topology-view {
  height: 100%;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
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

.stats-row {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #ebeef5;
}

.topology-wrapper {
  height: 600px;
}
</style>

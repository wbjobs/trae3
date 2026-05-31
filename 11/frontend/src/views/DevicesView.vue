<template>
  <div class="devices-view">
    <el-card shadow="never">
      <template #header>
        <div class="card-header">
          <span class="card-title">设备管理</span>
          <div class="header-actions">
            <el-select v-model="filterType" placeholder="设备类型" style="width: 150px;" size="small" clearable @change="fetchDevices">
              <el-option label="核心AP" value="ap" />
              <el-option label="中继节点" value="repeater" />
              <el-option label="终端设备" value="endpoint" />
            </el-select>
            <el-button type="primary" size="small" @click="showAddDialog = true">
              <el-icon><Plus /></el-icon>
              添加设备
            </el-button>
            <el-button type="primary" size="small" @click="fetchDevices">
              <el-icon><Refresh /></el-icon>
              刷新
            </el-button>
          </div>
        </div>
      </template>

      <el-table :data="devices" style="width: 100%;" v-loading="loading">
        <el-table-column prop="device_id" label="设备ID" width="140" />
        <el-table-column prop="name" label="设备名称" width="150" />
        <el-table-column prop="device_type" label="类型" width="100">
          <template #default="{ row }">
            <el-tag :type="getDeviceTypeColor(row.device_type)" size="small">
              {{ getDeviceTypeName(row.device_type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="80">
          <template #default="{ row }">
            <el-tag :type="row.status === 'online' ? 'success' : 'danger'" size="small">
              {{ row.status === 'online' ? '在线' : '离线' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="location" label="位置" min-width="150" />
        <el-table-column prop="ip_address" label="IP地址" width="130" />
        <el-table-column prop="parent_device_id" label="父节点" width="140" />
        <el-table-column prop="updated_at" label="更新时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.updated_at) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="150" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="viewDeviceDetail(row)">
              详情
            </el-button>
            <el-button type="danger" size="small" @click="deleteDevice(row)">
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <el-dialog v-model="showDetailDialog" title="设备详情" width="800px">
      <el-descriptions v-if="selectedDevice" :column="2" border>
        <el-descriptions-item label="设备ID">{{ selectedDevice.device_id }}</el-descriptions-item>
        <el-descriptions-item label="设备名称">{{ selectedDevice.name }}</el-descriptions-item>
        <el-descriptions-item label="设备类型">
          <el-tag :type="getDeviceTypeColor(selectedDevice.device_type)">
            {{ getDeviceTypeName(selectedDevice.device_type) }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="selectedDevice.status === 'online' ? 'success' : 'danger'">
            {{ selectedDevice.status === 'online' ? '在线' : '离线' }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="位置">{{ selectedDevice.location || '-' }}</el-descriptions-item>
        <el-descriptions-item label="IP地址">{{ selectedDevice.ip_address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="MAC地址">{{ selectedDevice.mac_address || '-' }}</el-descriptions-item>
        <el-descriptions-item label="父节点">{{ selectedDevice.parent_device_id || '-' }}</el-descriptions-item>
      </el-descriptions>

      <el-tabs v-model="activeTab" style="margin-top: 20px;">
        <el-tab-pane label="信号数据" name="signal">
          <div ref="signalChartRef" style="height: 300px; margin-top: 20px;"></div>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>

    <el-dialog v-model="showAddDialog" title="添加设备" width="500px">
      <el-form :model="addForm" label-width="100px">
        <el-form-item label="设备ID">
          <el-input v-model="addForm.device_id" placeholder="请输入设备ID" />
        </el-form-item>
        <el-form-item label="设备名称">
          <el-input v-model="addForm.name" placeholder="请输入设备名称" />
        </el-form-item>
        <el-form-item label="设备类型">
          <el-select v-model="addForm.device_type" placeholder="请选择设备类型" style="width: 100%;">
            <el-option label="核心AP" value="ap" />
            <el-option label="中继节点" value="repeater" />
            <el-option label="终端设备" value="endpoint" />
          </el-select>
        </el-form-item>
        <el-form-item label="位置">
          <el-input v-model="addForm.location" placeholder="请输入位置" />
        </el-form-item>
        <el-form-item label="父节点">
          <el-select v-model="addForm.parent_device_id" placeholder="请选择父节点" style="width: 100%;" clearable>
            <el-option v-for="dev in devices" :key="dev.device_id" :label="dev.name" :value="dev.device_id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showAddDialog = false">取消</el-button>
        <el-button type="primary" @click="addDevice">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Refresh } from '@element-plus/icons-vue'
import * as echarts from 'echarts'
import { deviceApi } from '../api'

const devices = ref([])
const loading = ref(false)
const filterType = ref('')
const showDetailDialog = ref(false)
const showAddDialog = ref(false)
const selectedDevice = ref(null)
const activeTab = ref('signal')
const signalChartRef = ref(null)
let signalChart = null

const addForm = ref({
  device_id: '',
  name: '',
  device_type: '',
  location: '',
  parent_device_id: ''
})

const getDeviceTypeName = (type) => {
  const names = {
    ap: '核心AP',
    repeater: '中继节点',
    endpoint: '终端设备'
  }
  return names[type] || type
}

const getDeviceTypeColor = (type) => {
  const colors = {
    ap: 'primary',
    repeater: 'warning',
    endpoint: 'info'
  }
  return colors[type] || 'info'
}

const formatTime = (time) => {
  if (!time) return '-'
  return new Date(time).toLocaleString('zh-CN')
}

const fetchDevices = async () => {
  loading.value = true
  try {
    let res
    if (filterType.value) {
      res = await deviceApi.getByType(filterType.value)
    } else {
      res = await deviceApi.getAll()
    }
    if (res.success) {
      devices.value = res.data
    }
  } catch (e) {
    ElMessage.error('获取设备列表失败')
  } finally {
    loading.value = false
  }
}

const viewDeviceDetail = async (device) => {
  selectedDevice.value = device
  showDetailDialog.value = true
  
  await nextTick()
  loadSignalChart(device.device_id)
}

const loadSignalChart = async (deviceId) => {
  try {
    const endTime = new Date()
    const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000)
    
    const res = await deviceApi.getSignalAggregated(
      deviceId,
      startTime.toISOString(),
      endTime.toISOString(),
      '1h'
    )
    
    if (res.success && res.data.length > 0) {
      renderSignalChart(res.data)
    }
  } catch (e) {
    console.error('加载信号图表失败', e)
  }
}

const renderSignalChart = (data) => {
  if (!signalChartRef.value) return
  
  if (!signalChart) {
    signalChart = echarts.init(signalChartRef.value)
  }
  
  const option = {
    tooltip: {
      trigger: 'axis'
    },
    legend: {
      data: ['信号强度', 'CPU使用率', '内存使用率']
    },
    xAxis: {
      type: 'category',
      data: data.map(d => new Date(d.bucket).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    },
    yAxis: [
      {
        type: 'value',
        name: '信号强度(dBm)'
      },
      {
        type: 'value',
        name: '使用率(%)'
      }
    ],
    series: [
      {
        name: '信号强度',
        type: 'line',
        smooth: true,
        data: data.map(d => d.avg_signal),
        yAxisIndex: 0
      },
      {
        name: 'CPU使用率',
        type: 'line',
        smooth: true,
        data: data.map(d => d.avg_cpu),
        yAxisIndex: 1
      },
      {
        name: '内存使用率',
        type: 'line',
        smooth: true,
        data: data.map(d => d.avg_memory),
        yAxisIndex: 1
      }
    ]
  }
  
  signalChart.setOption(option)
}

const addDevice = async () => {
  try {
    await deviceApi.create(addForm.value)
    ElMessage.success('添加成功')
    showAddDialog.value = false
    addForm.value = { device_id: '', name: '', device_type: '', location: '', parent_device_id: '' }
    fetchDevices()
  } catch (e) {
    ElMessage.error('添加失败')
  }
}

const deleteDevice = async (device) => {
  try {
    await ElMessageBox.confirm(`确认删除设备 ${device.name}?`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    
    await deviceApi.delete(device.device_id)
    ElMessage.success('删除成功')
    fetchDevices()
  } catch (e) {
    if (e !== 'cancel') {
      ElMessage.error('删除失败')
    }
  }
}

onMounted(() => {
  fetchDevices()
})
</script>

<style scoped>
.devices-view {
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
</style>

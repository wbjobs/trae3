<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">异常告警</h2>
    </div>

    <div class="filter-bar">
      <div class="filter-item">
        <span class="filter-label">严重程度:</span>
        <el-select v-model="filters.severity" placeholder="全部" clearable style="width: 120px">
          <el-option label="严重" value="critical" />
          <el-option label="警告" value="warning" />
          <el-option label="一般" value="info" />
        </el-select>
      </div>
      <div class="filter-item">
        <span class="filter-label">状态:</span>
        <el-select v-model="filters.status" placeholder="全部" clearable style="width: 120px">
          <el-option label="待处理" value="pending" />
          <el-option label="已处理" value="handled" />
        </el-select>
      </div>
      <div class="filter-item">
        <el-button type="primary" @click="loadAnomalies">查询</el-button>
      </div>
    </div>

    <div class="stats-grid">
      <StatusCard label="总异常数" :value="stats.total" icon="Warning" status="normal" />
      <StatusCard label="严重异常" :value="stats.by_severity?.critical || 0" icon="CircleClose" status="danger" />
      <StatusCard label="警告异常" :value="stats.by_severity?.warning || 0" icon="WarningFilled" status="warning" />
      <StatusCard label="待处理" :value="stats.pending_count" icon="Clock" status="warning" />
    </div>

    <div class="chart-container">
      <div class="chart-title">异常列表</div>
      <el-table :data="anomalies" stripe v-loading="loading">
        <el-table-column type="selection" width="55" />
        <el-table-column prop="device_code" label="设备" width="120" />
        <el-table-column prop="timestamp" label="时间" width="180">
          <template #default="{ row }">
            {{ formatTime(row.timestamp) }}
          </template>
        </el-table-column>
        <el-table-column prop="anomaly_type" label="异常类型" width="150" />
        <el-table-column prop="severity" label="严重程度" width="100">
          <template #default="{ row }">
            <el-tag :type="getSeverityType(row.severity)">
              {{ getSeverityLabel(row.severity) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="axis" label="轴向" width="80" />
        <el-table-column prop="value" label="数值" width="100">
          <template #default="{ row }">
            {{ row.value?.toFixed(4) }}
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" min-width="200" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'pending' ? 'warning' : 'success'">
              {{ row.status === 'pending' ? '待处理' : '已处理' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120">
          <template #default="{ row }">
            <el-button
              v-if="row.status === 'pending'"
              size="small"
              type="primary"
              @click="handleAnomaly(row)"
            >
              处理
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="showHandleDialog" title="处理异常" width="500px">
      <el-form :model="handleForm" label-width="80px">
        <el-form-item label="处理人">
          <el-input v-model="handleForm.handled_by" />
        </el-form-item>
        <el-form-item label="处理说明">
          <el-input type="textarea" v-model="handleForm.notes" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showHandleDialog = false">取消</el-button>
        <el-button type="primary" @click="submitHandle">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import StatusCard from '@/components/StatusCard.vue'
import { anomalyApi } from '@/api'
import dayjs from 'dayjs'

const anomalies = ref([])
const loading = ref(false)
const showHandleDialog = ref(false)
const currentAnomaly = ref(null)
const stats = ref({
  total: 0,
  by_severity: {},
  pending_count: 0
})

const filters = reactive({
  severity: '',
  status: ''
})

const handleForm = reactive({
  handled_by: '',
  notes: ''
})

const formatTime = (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')

const getSeverityType = (severity) => {
  const map = { critical: 'danger', warning: 'warning', info: 'info' }
  return map[severity] || 'info'
}

const getSeverityLabel = (severity) => {
  const map = { critical: '严重', warning: '警告', info: '一般' }
  return map[severity] || '一般'
}

const loadAnomalies = async () => {
  loading.value = true
  try {
    const data = await anomalyApi.getAnomalies(filters)
    anomalies.value = data || []

    stats.value = await anomalyApi.getStats()
  } catch (error) {
    ElMessage.error('加载异常列表失败')
  } finally {
    loading.value = false
  }
}

const handleAnomaly = (row) => {
  currentAnomaly.value = row
  showHandleDialog.value = true
}

const submitHandle = async () => {
  try {
    await anomalyApi.handleAnomaly(currentAnomaly.value.id, handleForm)
    ElMessage.success('处理成功')
    showHandleDialog.value = false
    loadAnomalies()
  } catch (error) {
    ElMessage.error('处理失败')
  }
}

onMounted(() => {
  loadAnomalies()
})
</script>

<template>
  <div>
    <div class="page-container">
      <div class="page-header">
        <h2 class="page-title">数据概览</h2>
        <div>
          <el-button type="primary" @click="generateTestData">
            <el-icon><Refresh /></el-icon>
            生成测试数据
          </el-button>
        </div>
      </div>

      <div class="stats-grid">
        <StatusCard
          label="设备总数"
          :value="stats.deviceCount"
          icon="Monitor"
          status="normal"
        />
        <StatusCard
          label="今日数据点数"
          :value="stats.dataCount"
          icon="DataLine"
          status="success"
        />
        <StatusCard
          label="待处理告警"
          :value="stats.pendingAnomalies"
          icon="Warning"
          :status="stats.pendingAnomalies > 10 ? 'danger' : stats.pendingAnomalies > 0 ? 'warning' : 'success'"
        />
        <StatusCard
          label="本月分析报告"
          :value="stats.reportCount"
          icon="Document"
          status="normal"
        />
      </div>

      <el-row :gutter="24">
        <el-col :span="12">
          <div class="chart-container">
            <div class="chart-title">设备运行状态</div>
            <div ref="statusChartRef" class="chart-wrapper"></div>
          </div>
        </el-col>
        <el-col :span="12">
          <div class="chart-container">
            <div class="chart-title">异常类型分布</div>
            <div ref="anomalyChartRef" class="chart-wrapper"></div>
          </div>
        </el-col>
      </el-row>

      <div class="chart-container">
        <div class="chart-title">最近异常记录</div>
        <el-table :data="recentAnomalies" stripe>
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
          <el-table-column prop="description" label="描述" />
        </el-table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { ElMessage } from 'element-plus'
import StatusCard from '@/components/StatusCard.vue'
import { deviceApi, anomalyApi, dataCollectionApi } from '@/api'
import dayjs from 'dayjs'

const stats = ref({
  deviceCount: 0,
  dataCount: 0,
  pendingAnomalies: 0,
  reportCount: 0
})

const recentAnomalies = ref([])

const statusChartRef = ref(null)
const anomalyChartRef = ref(null)
let statusChart = null
let anomalyChart = null

const formatTime = (time) => {
  return dayjs(time).format('YYYY-MM-DD HH:mm:ss')
}

const getSeverityType = (severity) => {
  const map = {
    critical: 'danger',
    warning: 'warning',
    info: 'info'
  }
  return map[severity] || 'info'
}

const getSeverityLabel = (severity) => {
  const map = {
    critical: '严重',
    warning: '警告',
    info: '一般'
  }
  return map[severity] || '一般'
}

const loadStats = async () => {
  try {
    const devices = await deviceApi.getDevices()
    stats.value.deviceCount = devices.length || 0

    const anomalyStats = await anomalyApi.getStats()
    stats.value.pendingAnomalies = anomalyStats.pending_count || 0
  } catch (error) {
    console.error('Failed to load stats:', error)
  }
}

const loadRecentAnomalies = async () => {
  try {
    const anomalies = await anomalyApi.getAnomalies({ limit: 10 })
    recentAnomalies.value = anomalies || []
  } catch (error) {
    console.error('Failed to load anomalies:', error)
  }
}

const initCharts = () => {
  if (statusChartRef.value) {
    statusChart = echarts.init(statusChartRef.value)
    statusChart.setOption({
      tooltip: {
        trigger: 'item'
      },
      series: [{
        name: '设备状态',
        type: 'pie',
        radius: ['40%', '70%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 10,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: true,
          formatter: '{b}: {c} ({d}%)'
        },
        data: [
          { value: 5, name: '正常运行', itemStyle: { color: '#67c23a' } },
          { value: 2, name: '运行异常', itemStyle: { color: '#e6a23c' } },
          { value: 1, name: '停机', itemStyle: { color: '#909399' } }
        ]
      }]
    })
  }

  if (anomalyChartRef.value) {
    anomalyChart = echarts.init(anomalyChartRef.value)
    anomalyChart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        }
      },
      xAxis: {
        type: 'category',
        data: ['RMS超标', '峰值超标', '冲击信号', '过热', '谐波失真', '其他']
      },
      yAxis: {
        type: 'value'
      },
      series: [{
        data: [12, 8, 15, 5, 3, 2],
        type: 'bar',
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: '#83bff6' },
            { offset: 1, color: '#188df0' }
          ])
        }
      }]
    })
  }
}

const generateTestData = async () => {
  try {
    await dataCollectionApi.generateSample({
      device_code: 'PUMP-001',
      duration_seconds: 1,
      has_anomaly: false
    })
    ElMessage.success('测试数据生成成功')
    loadStats()
  } catch (error) {
    ElMessage.error('生成失败')
  }
}

const handleResize = () => {
  statusChart?.resize()
  anomalyChart?.resize()
}

onMounted(() => {
  loadStats()
  loadRecentAnomalies()
  setTimeout(initCharts, 100)
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  statusChart?.dispose()
  anomalyChart?.dispose()
  window.removeEventListener('resize', handleResize)
})
</script>

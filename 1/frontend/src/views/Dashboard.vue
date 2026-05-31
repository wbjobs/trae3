<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useNodeStore } from '@/store/node'
import { useRoomStore } from '@/store/room'
import StatCard from '@/components/StatCard.vue'
import MetricChart from '@/components/MetricChart.vue'
import {
  Activity,
  Server,
  AlertTriangle,
  XCircle,
  RefreshCw
} from 'lucide-vue-next'

const nodeStore = useNodeStore()
const roomStore = useRoomStore()

const loading = ref(false)
let refreshInterval: number | null = null

const cpuData = ref([45, 52, 38, 65, 48, 72, 55, 60, 42, 58, 68, 50])
const memoryData = ref([62, 58, 70, 55, 68, 60, 72, 65, 58, 70, 63, 68])
const xAxisData = ref(['00:00', '02:00', '04:00', '06:00', '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'])

const statusPieData = ref([
  { value: 15, name: '在线', itemStyle: { color: '#00C853' } },
  { value: 3, name: '告警', itemStyle: { color: '#FFD600' } },
  { value: 1, name: '异常', itemStyle: { color: '#FF1744' } },
  { value: 1, name: '离线', itemStyle: { color: '#8492A6' } }
])

const roomBarData = ref([
  { name: '北京机房-A', online: 5, warning: 1, error: 0, offline: 0 },
  { name: '北京机房-B', online: 4, warning: 0, error: 1, offline: 0 },
  { name: '上海机房', online: 3, warning: 2, error: 0, offline: 0 },
  { name: '深圳机房', online: 2, warning: 0, error: 0, offline: 1 },
  { name: '成都机房', online: 1, warning: 0, error: 0, offline: 0 }
])

const barSeries = ref([
  {
    name: '在线',
    type: 'bar',
    stack: 'total',
    data: [5, 4, 3, 2, 1],
    itemStyle: { color: '#00C853' }
  },
  {
    name: '告警',
    type: 'bar',
    stack: 'total',
    data: [1, 0, 2, 0, 0],
    itemStyle: { color: '#FFD600' }
  },
  {
    name: '异常',
    type: 'bar',
    stack: 'total',
    data: [0, 1, 0, 0, 0],
    itemStyle: { color: '#FF1744' }
  },
  {
    name: '离线',
    type: 'bar',
    stack: 'total',
    data: [0, 0, 0, 1, 0],
    itemStyle: { color: '#8492A6' }
  }
])

async function fetchData() {
  loading.value = true
  try {
    await Promise.all([
      nodeStore.fetchStats(),
      roomStore.fetchStats()
    ])
  } finally {
    loading.value = false
  }
}

function startAutoRefresh() {
  refreshInterval = window.setInterval(() => {
    cpuData.value = cpuData.value.map(() => Math.floor(Math.random() * 40) + 35)
    memoryData.value = memoryData.value.map(() => Math.floor(Math.random() * 30) + 50)
  }, 5000)
}

function stopAutoRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval)
    refreshInterval = null
  }
}

onMounted(() => {
  fetchData()
  startAutoRefresh()
})

onUnmounted(() => {
  stopAutoRefresh()
})
</script>

<template>
  <div class="dashboard">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-xl font-bold text-dark-text">状态总览</h2>
        <p class="text-sm text-dark-textSecondary mt-1">实时监控跨机房所有节点运行状态</p>
      </div>
      <button
        class="px-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors flex items-center gap-2"
        @click="fetchData"
        :disabled="loading"
      >
        <RefreshCw :class="['w-4 h-4', loading ? 'animate-spin' : '']" />
        刷新数据
      </button>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
      <StatCard
        title="节点总数"
        :value="nodeStore.stats.total || 20"
        icon="server"
        color="primary"
        unit="个"
        subtitle="跨5个机房部署"
      />
      <StatCard
        title="在线节点"
        :value="nodeStore.stats.online || 15"
        icon="success"
        color="success"
        unit="个"
        :trend="2.5"
      />
      <StatCard
        title="告警节点"
        :value="nodeStore.stats.warning || 3"
        icon="warning"
        color="warning"
        unit="个"
        :trend="-15"
      />
      <StatCard
        title="异常节点"
        :value="nodeStore.stats.error || 2"
        icon="error"
        color="danger"
        unit="个"
        :trend="100"
      />
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
      <div class="lg:col-span-2">
        <MetricChart
          title="CPU/内存使用率趋势（24小时）"
          type="line"
          :x-axis-data="xAxisData"
          :series="[
            {
              name: 'CPU',
              type: 'line',
              smooth: true,
              data: cpuData,
              lineStyle: { color: '#00D4FF' },
              itemStyle: { color: '#00D4FF' },
              areaStyle: {
                color: {
                  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
                    { offset: 1, color: 'rgba(0, 212, 255, 0)' }
                  ]
                }
              }
            },
            {
              name: '内存',
              type: 'line',
              smooth: true,
              data: memoryData,
              lineStyle: { color: '#00C853' },
              itemStyle: { color: '#00C853' },
              areaStyle: {
                color: {
                  type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: 'rgba(0, 200, 83, 0.3)' },
                    { offset: 1, color: 'rgba(0, 200, 83, 0)' }
                  ]
                }
              }
            }
          ]"
          height="350px"
        />
      </div>

      <MetricChart
        title="节点状态分布"
        type="pie"
        :data="statusPieData"
        height="350px"
      />
    </div>

    <div class="grid grid-cols-1 gap-6">
      <MetricChart
        title="各机房节点状态统计"
        type="bar"
        :x-axis-data="roomBarData.map(r => r.name)"
        :series="barSeries"
        height="300px"
      />
    </div>
  </div>
</template>

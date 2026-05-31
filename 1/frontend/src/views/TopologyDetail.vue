<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useNodeStore } from '@/store/node'
import { getNodeDetail, getNodeMetrics, controlNode } from '@/api/node'
import MetricChart from '@/components/MetricChart.vue'
import type { NodeInfo, NodeMetric } from '@/types'
import {
  ArrowLeft,
  RefreshCw,
  Play,
  Pause,
  RotateCcw,
  Cpu,
  HardDrive,
  MemoryStick,
  Network,
  Clock,
  MapPin,
  Server,
  Activity,
  AlertTriangle,
  CheckCircle
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const nodeStore = useNodeStore()

const nodeId = computed(() => route.params.id as string)
const nodeDetail = ref<NodeInfo | null>(null)
const metrics = ref<NodeMetric[]>([])
const loading = ref(false)
const metricsLoading = ref(false)
const controlLoading = ref(false)

const cpuChartData = computed(() => {
  const xAxis = metrics.value.map(m => new Date(m.timestamp).toLocaleTimeString())
  const series = [{
    name: 'CPU使用率',
    type: 'line',
    smooth: true,
    areaStyle: { opacity: 0.3 },
    data: metrics.value.map(m => m.cpuUsage)
  }]
  return { xAxis, series }
})

const memoryChartData = computed(() => {
  const xAxis = metrics.value.map(m => new Date(m.timestamp).toLocaleTimeString())
  const series = [{
    name: '内存使用率',
    type: 'line',
    smooth: true,
    areaStyle: { opacity: 0.3 },
    data: metrics.value.map(m => m.memoryUsage)
  }]
  return { xAxis, series }
})

const networkChartData = computed(() => {
  const xAxis = metrics.value.map(m => new Date(m.timestamp).toLocaleTimeString())
  const series = [
    {
      name: '网络入站',
      type: 'line',
      smooth: true,
      data: metrics.value.map(m => m.networkIn)
    },
    {
      name: '网络出站',
      type: 'line',
      smooth: true,
      data: metrics.value.map(m => m.networkOut)
    }
  ]
  return { xAxis, series }
})

function goBack() {
  router.push('/topology')
}

async function fetchDetail() {
  try {
    loading.value = true
    const res = await getNodeDetail(nodeId.value)
    if (res.code === 200) {
      nodeDetail.value = res.data
    }
  } catch (error) {
    console.error('获取节点详情失败:', error)
  } finally {
    loading.value = false
  }
}

async function fetchMetrics() {
  try {
    metricsLoading.value = true
    const res = await getNodeMetrics(nodeId.value, { hours: 24 })
    if (res.code === 200) {
      metrics.value = res.data.list || []
    }
  } catch (error) {
    console.error('获取节点指标失败:', error)
  } finally {
    metricsLoading.value = false
  }
}

async function handleControl(action: 'start' | 'stop' | 'restart') {
  try {
    controlLoading.value = true
    const res = await controlNode(nodeId.value, action)
    if (res.code === 200) {
      ElMessage.success(`${action === 'start' ? '启动' : action === 'stop' ? '停止' : '重启'}节点成功`)
      fetchDetail()
    }
  } catch (error) {
    console.error('节点控制失败:', error)
  } finally {
    controlLoading.value = false
  }
}

function formatUptime(seconds: number): string {
  if (!seconds) return '0秒'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}小时${mins}分钟`
  if (hours > 0) return `${hours}小时${mins}分钟`
  return `${mins}分钟`
}

function getStatusIcon(status: string) {
  const icons: Record<string, any> = {
    online: CheckCircle,
    warning: AlertTriangle,
    error: AlertTriangle,
    offline: Activity
  }
  return icons[status] || Activity
}

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    online: 'text-success',
    warning: 'text-warning',
    error: 'text-danger',
    offline: 'text-dark-textSecondary'
  }
  return classes[status] || 'text-dark-textSecondary'
}

onMounted(() => {
  fetchDetail()
  fetchMetrics()
})
</script>

<template>
  <div class="topology-detail-page">
    <div class="flex items-center gap-4 mb-6">
      <button
        class="p-2 bg-dark-card border border-dark-border rounded-lg text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors"
        @click="goBack"
      >
        <ArrowLeft class="w-5 h-5" />
      </button>
      <div>
        <h2 class="text-xl font-bold text-dark-text">节点详情</h2>
        <p class="text-sm text-dark-textSecondary mt-1">实时监控节点运行状态与历史指标</p>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="8" animated />

    <div v-else-if="nodeDetail" class="space-y-6">
      <div class="bg-dark-card rounded-lg border border-dark-border p-6">
        <div class="flex items-start justify-between mb-6">
          <div class="flex items-center gap-4">
            <div class="w-20 h-20 rounded-xl bg-primary-600 flex items-center justify-center">
              <Server class="w-10 h-10 text-white" />
            </div>
            <div>
              <h3 class="text-2xl font-bold text-dark-text">{{ nodeDetail.name }}</h3>
              <div class="flex items-center gap-4 mt-2">
                <span class="text-sm font-mono text-dark-textSecondary">{{ nodeDetail.ip }}</span>
                <span class="text-sm text-dark-textSecondary flex items-center gap-1">
                  <MapPin class="w-4 h-4" />
                  {{ nodeDetail.roomId }}
                </span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex items-center gap-2 px-4 py-2 bg-dark-bg rounded-lg">
              <component :is="getStatusIcon(nodeDetail.status)" :class="['w-5 h-5', getStatusClass(nodeDetail.status)]" />
              <span :class="['font-medium', getStatusClass(nodeDetail.status)]">
                {{ nodeStore.getNodeStatusText(nodeDetail.status) }}
              </span>
            </div>
            <el-button
              v-loading="controlLoading"
              type="success"
              @click="handleControl('start')"
              :disabled="nodeDetail.status === 'online'"
            >
              <Play class="w-4 h-4 mr-1" />
              启动
            </el-button>
            <el-button
              v-loading="controlLoading"
              type="warning"
              @click="handleControl('restart')"
            >
              <RotateCcw class="w-4 h-4 mr-1" />
              重启
            </el-button>
            <el-button
              v-loading="controlLoading"
              type="danger"
              @click="handleControl('stop')"
              :disabled="nodeDetail.status === 'offline'"
            >
              <Pause class="w-4 h-4 mr-1" />
              停止
            </el-button>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-dark-bg rounded-lg p-5 text-center">
            <Cpu class="w-10 h-10 mx-auto mb-3 text-accent-400" />
            <div class="text-3xl font-bold font-mono"
                 :class="(nodeDetail.cpuUsage || 0) > 80 ? 'text-danger' : (nodeDetail.cpuUsage || 0) > 60 ? 'text-warning' : 'text-success'">
              {{ nodeDetail.cpuUsage?.toFixed(1) }}%
            </div>
            <div class="text-sm text-dark-textSecondary mt-2">CPU使用率</div>
          </div>
          <div class="bg-dark-bg rounded-lg p-5 text-center">
            <MemoryStick class="w-10 h-10 mx-auto mb-3 text-success" />
            <div class="text-3xl font-bold font-mono"
                 :class="(nodeDetail.memoryUsage || 0) > 80 ? 'text-danger' : (nodeDetail.memoryUsage || 0) > 60 ? 'text-warning' : 'text-success'">
              {{ nodeDetail.memoryUsage?.toFixed(1) }}%
            </div>
            <div class="text-sm text-dark-textSecondary mt-2">内存使用率</div>
          </div>
          <div class="bg-dark-bg rounded-lg p-5 text-center">
            <HardDrive class="w-10 h-10 mx-auto mb-3 text-warning" />
            <div class="text-3xl font-bold font-mono"
                 :class="(nodeDetail.diskUsage || 0) > 80 ? 'text-danger' : (nodeDetail.diskUsage || 0) > 60 ? 'text-warning' : 'text-success'">
              {{ nodeDetail.diskUsage?.toFixed(1) }}%
            </div>
            <div class="text-sm text-dark-textSecondary mt-2">磁盘使用率</div>
          </div>
          <div class="bg-dark-bg rounded-lg p-5 text-center">
            <Clock class="w-10 h-10 mx-auto mb-3 text-info" />
            <div class="text-3xl font-bold font-mono text-info">
              {{ formatUptime(nodeDetail.uptime || 0) }}
            </div>
            <div class="text-sm text-dark-textSecondary mt-2">运行时间</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="bg-dark-card rounded-lg border border-dark-border p-6">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-medium text-dark-text">CPU 使用率趋势（24小时）</h4>
            <button
              class="p-1.5 text-dark-textSecondary hover:text-accent-400 transition-colors"
              @click="fetchMetrics"
            >
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': metricsLoading }" />
            </button>
          </div>
          <MetricChart
            type="line"
            :series="cpuChartData.series"
            :xAxisData="cpuChartData.xAxis"
            height="250"
          />
        </div>

        <div class="bg-dark-card rounded-lg border border-dark-border p-6">
          <div class="flex items-center justify-between mb-4">
            <h4 class="font-medium text-dark-text">内存使用率趋势（24小时）</h4>
            <button
              class="p-1.5 text-dark-textSecondary hover:text-accent-400 transition-colors"
              @click="fetchMetrics"
            >
              <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': metricsLoading }" />
            </button>
          </div>
          <MetricChart
            type="line"
            :series="memoryChartData.series"
            :xAxisData="memoryChartData.xAxis"
            height="250"
          />
        </div>
      </div>

      <div class="bg-dark-card rounded-lg border border-dark-border p-6">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-medium text-dark-text">网络流量趋势（24小时）</h4>
          <button
            class="p-1.5 text-dark-textSecondary hover:text-accent-400 transition-colors"
            @click="fetchMetrics"
          >
            <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': metricsLoading }" />
          </button>
        </div>
        <MetricChart
          type="line"
          :series="networkChartData.series"
          :xAxisData="networkChartData.xAxis"
          height="250"
        />
      </div>

      <div class="bg-dark-card rounded-lg border border-dark-border p-6">
        <h4 class="font-medium text-dark-text mb-4">基础信息</h4>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">节点ID</span>
              <span class="font-mono text-dark-text">{{ nodeDetail.id }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">IP地址</span>
              <span class="font-mono text-dark-text">{{ nodeDetail.ip }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">所属机房</span>
              <span class="text-dark-text">{{ nodeDetail.roomId }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">最后更新</span>
              <span class="text-dark-text">{{ nodeDetail.updatedAt }}</span>
            </div>
          </div>
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">父节点ID</span>
              <span class="font-mono text-dark-text">{{ nodeDetail.parentId || '无' }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">CPU使用率</span>
              <span class="text-dark-text">{{ nodeDetail.cpuUsage.toFixed(1) }}%</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">内存使用率</span>
              <span class="text-dark-text">{{ nodeDetail.memoryUsage.toFixed(1) }}%</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">磁盘使用率</span>
              <span class="text-dark-text">{{ nodeDetail.diskUsage.toFixed(1) }}%</span>
            </div>
          </div>
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">状态</span>
              <span class="text-dark-text">{{ nodeDetail.status }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">运行时间</span>
              <span class="text-dark-text">{{ formatUptime(nodeDetail.uptime || 0) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">创建时间</span>
              <span class="text-dark-text">{{ nodeDetail.createdAt }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">Trace ID</span>
              <span class="font-mono text-dark-text text-xs">{{ nodeDetail.id }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="bg-dark-card rounded-lg border border-dark-border p-12 text-center">
      <Server class="w-16 h-16 mx-auto mb-4 text-dark-textSecondary opacity-30" />
      <p class="text-dark-textSecondary">节点不存在或已被删除</p>
      <el-button class="mt-4" @click="goBack">返回列表</el-button>
    </div>
  </div>
</template>

<script lang="ts">
import { ElMessage, ElButton, ElSkeleton } from 'element-plus'

export default {
  components: {
    ElMessage,
    ElButton,
    ElSkeleton
  }
}
</script>

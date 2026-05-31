<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useRoomStore } from '@/store/room'
import { getRoomDetail, getRoomNodes, batchControlNodes } from '@/api/room'
import MetricChart from '@/components/MetricChart.vue'
import NodeTree from '@/components/NodeTree.vue'
import type { RoomInfo, NodeInfo } from '@/types'
import {
  ArrowLeft,
  RefreshCw,
  Play,
  Pause,
  Server,
  MapPin,
  Activity,
  Cpu,
  MemoryStick,
  HardDrive,
  Users,
  CheckCircle,
  AlertTriangle,
  XCircle
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const roomStore = useRoomStore()

const roomId = computed(() => route.params.id as string)
const roomDetail = ref<RoomInfo | null>(null)
const roomNodes = ref<NodeInfo[]>([])
const loading = ref(false)
const nodesLoading = ref(false)
const controlLoading = ref(false)
const activeTab = ref<'overview' | 'nodes' | 'metrics'>('overview')

const avgCpuChartData = computed(() => {
  const data = generateMockChartData()
  const xAxis = data.times
  const series = [{
    name: '平均CPU',
    data: data.cpu,
    type: 'line',
    areaStyle: { opacity: 0.3 }
  }]
  return { xAxis, series }
})

const avgMemoryChartData = computed(() => {
  const data = generateMockChartData()
  const xAxis = data.times
  const series = [{
    name: '平均内存',
    data: data.memory,
    type: 'line',
    areaStyle: { opacity: 0.3 }
  }]
  return { xAxis, series }
})

const cpuBarData = computed(() => {
  const xAxis = roomNodes.value.slice(0, 10).map(n => n.name)
  const series = [{
    name: 'CPU',
    data: roomNodes.value.slice(0, 10).map(n => n.cpuUsage || 0),
    type: 'bar'
  }]
  return { xAxis, series }
})

const memoryBarData = computed(() => {
  const xAxis = roomNodes.value.slice(0, 10).map(n => n.name)
  const series = [{
    name: '内存',
    data: roomNodes.value.slice(0, 10).map(n => n.memoryUsage || 0),
    type: 'bar'
  }]
  return { xAxis, series }
})

const diskBarData = computed(() => {
  const xAxis = roomNodes.value.slice(0, 10).map(n => n.name)
  const series = [{
    name: '磁盘',
    data: roomNodes.value.slice(0, 10).map(n => n.diskUsage || 0),
    type: 'bar'
  }]
  return { xAxis, series }
})

function generateMockChartData() {
  const times: string[] = []
  const cpu: number[] = []
  const memory: number[] = []
  const now = new Date()
  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 3600000)
    times.push(d.toLocaleTimeString().slice(0, 5))
    cpu.push(Math.round(40 + Math.random() * 40))
    memory.push(Math.round(50 + Math.random() * 30))
  }
  return { times, cpu, memory }
}

function goBack() {
  router.push('/rooms')
}

async function fetchDetail() {
  try {
    loading.value = true
    const res = await getRoomDetail(roomId.value)
    if (res.code === 200) {
      roomDetail.value = res.data
    }
  } catch (error) {
    console.error('获取机房详情失败:', error)
  } finally {
    loading.value = false
  }
}

async function fetchNodes() {
  try {
    nodesLoading.value = true
    const res = await getRoomNodes(roomId.value)
    if (res.code === 200) {
      roomNodes.value = res.data || []
    }
  } catch (error) {
    console.error('获取机房节点失败:', error)
  } finally {
    nodesLoading.value = false
  }
}

async function handleBatchControl(action: 'start' | 'pause') {
  try {
    controlLoading.value = true
    const res = await batchControlNodes(roomId.value, action)
    if (res.code === 200) {
      ElMessage.success(`${action === 'start' ? '启动' : '暂停'}所有节点采集成功`)
      fetchDetail()
      fetchNodes()
    }
  } catch (error) {
    console.error('批量控制失败:', error)
  } finally {
    controlLoading.value = false
  }
}

function getRegionName(code: string): string {
  const regions: Record<string, string> = {
    north: '华北',
    south: '华南',
    east: '华东',
    west: '华西',
    central: '华中'
  }
  return regions[code] || code
}

function getStatusType(status: string): 'success' | 'warning' | 'info' {
  const types: Record<string, 'success' | 'warning' | 'info'> = {
    active: 'success',
    maintenance: 'warning',
    offline: 'info'
  }
  return types[status] || 'info'
}

function getStatusText(status: string): string {
  const texts: Record<string, string> = {
    active: '运行中',
    maintenance: '维护中',
    offline: '离线'
  }
  return texts[status] || '未知'
}

function getNodeStatusIcon(status: string) {
  const icons: Record<string, any> = {
    online: CheckCircle,
    warning: AlertTriangle,
    error: XCircle,
    offline: Activity
  }
  return icons[status] || Activity
}

function getNodeStatusClass(status: string): string {
  const classes: Record<string, string> = {
    online: 'text-success',
    warning: 'text-warning',
    error: 'text-danger',
    offline: 'text-dark-textSecondary'
  }
  return classes[status] || 'text-dark-textSecondary'
}

function viewNodeDetail(node: NodeInfo) {
  router.push(`/topology/${node.id}`)
}

onMounted(() => {
  fetchDetail()
  fetchNodes()
})
</script>

<template>
  <div class="room-detail-page">
    <div class="flex items-center gap-4 mb-6">
      <button
        class="p-2 bg-dark-card border border-dark-border rounded-lg text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors"
        @click="goBack"
      >
        <ArrowLeft class="w-5 h-5" />
      </button>
      <div>
        <h2 class="text-xl font-bold text-dark-text">机房详情</h2>
        <p class="text-sm text-dark-textSecondary mt-1">查看机房信息与节点管理</p>
      </div>
    </div>

    <el-skeleton v-if="loading" :rows="6" animated />

    <div v-else-if="roomDetail" class="space-y-6">
      <div class="bg-dark-card rounded-lg border border-dark-border p-6">
        <div class="flex items-start justify-between mb-6">
          <div class="flex items-center gap-4">
            <div class="w-20 h-20 rounded-xl bg-primary-600 flex items-center justify-center">
              <Server class="w-10 h-10 text-white" />
            </div>
            <div>
              <h3 class="text-2xl font-bold text-dark-text">{{ roomDetail.name }}</h3>
              <div class="flex items-center gap-4 mt-2">
                <span class="text-sm text-dark-textSecondary flex items-center gap-1">
                  <MapPin class="w-4 h-4" />
                  {{ roomDetail.location }}
                </span>
                <span class="text-sm text-dark-textSecondary">{{ getRegionName(roomDetail.region) }}区域</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <el-tag size="large" :type="getStatusType(roomDetail.status)">
              {{ getStatusText(roomDetail.status) }}
            </el-tag>
            <el-button
              v-loading="controlLoading"
              type="success"
              @click="handleBatchControl('start')"
            >
              <Play class="w-4 h-4 mr-1" />
              全部启动
            </el-button>
            <el-button
              v-loading="controlLoading"
              type="warning"
              @click="handleBatchControl('pause')"
            >
              <Pause class="w-4 h-4 mr-1" />
              全部暂停
            </el-button>
          </div>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="bg-dark-bg rounded-lg p-5 text-center">
            <Server class="w-10 h-10 mx-auto mb-3 text-accent-400" />
            <div class="text-3xl font-bold text-dark-text">{{ roomDetail.nodeCount }}</div>
            <div class="text-sm text-dark-textSecondary mt-2">总节点数</div>
          </div>
          <div class="bg-dark-bg rounded-lg p-5 text-center">
            <Activity class="w-10 h-10 mx-auto mb-3 text-success" />
            <div class="text-3xl font-bold text-success">{{ roomDetail.onlineCount }}</div>
            <div class="text-sm text-dark-textSecondary mt-2">在线节点</div>
          </div>
          <div class="bg-dark-bg rounded-lg p-5 text-center">
            <AlertTriangle class="w-10 h-10 mx-auto mb-3 text-warning" />
            <div class="text-3xl font-bold text-warning">{{ roomDetail.warningCount }}</div>
            <div class="text-sm text-dark-textSecondary mt-2">告警节点</div>
          </div>
          <div class="bg-dark-bg rounded-lg p-5 text-center">
            <XCircle class="w-10 h-10 mx-auto mb-3 text-danger" />
            <div class="text-3xl font-bold text-danger">{{ roomDetail.errorCount }}</div>
            <div class="text-sm text-dark-textSecondary mt-2">异常节点</div>
          </div>
        </div>

        <div class="mt-6 pt-6 border-t border-dark-border">
          <h4 class="font-medium text-dark-text mb-4">机房信息</h4>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">机房ID</span>
              <span class="font-mono text-dark-text">{{ roomDetail.id }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">区域</span>
              <span class="text-dark-text">{{ getRegionName(roomDetail.region) }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">位置</span>
              <span class="text-dark-text">{{ roomDetail.location }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-dark-textSecondary">创建时间</span>
              <span class="text-dark-text">{{ roomDetail.createdAt }}</span>
            </div>
          </div>
          <p class="text-sm text-dark-textSecondary mt-4">{{ roomDetail.description || '暂无描述' }}</p>
        </div>
      </div>

      <div class="bg-dark-card rounded-lg border border-dark-border">
        <div class="border-b border-dark-border">
          <nav class="flex gap-1 px-4">
            <button
              v-for="tab in [
                { key: 'overview', label: '概览' },
                { key: 'nodes', label: '节点列表' },
                { key: 'metrics', label: '性能指标' }
              ]"
              :key="tab.key"
              :class="[
                'px-6 py-4 text-sm font-medium transition-colors border-b-2 -mb-px',
                activeTab === tab.key
                  ? 'text-accent-400 border-accent-400'
                  : 'text-dark-textSecondary border-transparent hover:text-dark-text'
              ]"
              @click="activeTab = tab.key as any"
            >
              {{ tab.label }}
            </button>
          </nav>
        </div>

        <div class="p-6">
          <div v-show="activeTab === 'overview'" class="space-y-6">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h4 class="font-medium text-dark-text mb-4">节点拓扑</h4>
                <div class="bg-dark-bg rounded-lg p-4 h-[400px] overflow-auto">
                  <NodeTree :room-id="roomId" />
                </div>
              </div>
              <div class="space-y-6">
                <div>
                  <h4 class="font-medium text-dark-text mb-4">平均CPU使用率趋势（24小时）</h4>
                  <MetricChart
                    type="line"
                    :series="avgCpuChartData.series"
                    :xAxisData="avgCpuChartData.xAxis"
                    height="180"
                  />
                </div>
                <div>
                  <h4 class="font-medium text-dark-text mb-4">平均内存使用率趋势（24小时）</h4>
                  <MetricChart
                    type="line"
                    :series="avgMemoryChartData.series"
                    :xAxisData="avgMemoryChartData.xAxis"
                    height="180"
                  />
                </div>
              </div>
            </div>
          </div>

          <div v-show="activeTab === 'nodes'">
            <div class="flex items-center justify-between mb-4">
              <h4 class="font-medium text-dark-text">节点列表</h4>
              <button
                class="p-1.5 text-dark-textSecondary hover:text-accent-400 transition-colors"
                @click="fetchNodes"
              >
                <RefreshCw class="w-4 h-4" :class="{ 'animate-spin': nodesLoading }" />
              </button>
            </div>
            <el-table
              :data="roomNodes"
              v-loading="nodesLoading"
              class="dark-table"
              :cell-style="{ color: '#E5E7EB', borderColor: '#374151' }"
              :header-cell-style="{ background: '#1F2937', color: '#9CA3AF', borderColor: '#374151' }"
            >
              <el-table-column prop="name" label="节点名称" min-width="150">
                <template #default="{ row }">
                  <div class="flex items-center gap-2 cursor-pointer hover:text-accent-400" @click="viewNodeDetail(row)">
                    <component :is="getNodeStatusIcon(row.status)" :class="['w-4 h-4', getNodeStatusClass(row.status)]" />
                    <span>{{ row.name }}</span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column prop="ip" label="IP地址" width="140">
                <template #default="{ row }">
                  <span class="font-mono text-sm">{{ row.ip }}</span>
                </template>
              </el-table-column>
              <el-table-column label="状态" width="100">
                <template #default="{ row }">
                  <el-tag size="small" :type="row.status === 'online' ? 'success' : row.status === 'warning' ? 'warning' : row.status === 'error' ? 'danger' : 'info'">
                    {{ roomStore.getNodeStatusText(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column label="CPU" width="100" align="center">
                <template #default="{ row }">
                  <span :class="(row.cpuUsage || 0) > 80 ? 'text-danger' : (row.cpuUsage || 0) > 60 ? 'text-warning' : 'text-success'">
                    {{ row.cpuUsage?.toFixed(1) }}%
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="内存" width="100" align="center">
                <template #default="{ row }">
                  <span :class="(row.memoryUsage || 0) > 80 ? 'text-danger' : (row.memoryUsage || 0) > 60 ? 'text-warning' : 'text-success'">
                    {{ row.memoryUsage?.toFixed(1) }}%
                  </span>
                </template>
              </el-table-column>
              <el-table-column label="磁盘" width="100" align="center">
                <template #default="{ row }">
                  <span :class="(row.diskUsage || 0) > 80 ? 'text-danger' : (row.diskUsage || 0) > 60 ? 'text-warning' : 'text-success'">
                    {{ row.diskUsage?.toFixed(1) }}%
                  </span>
                </template>
              </el-table-column>
              <el-table-column prop="updatedAt" label="最后更新" width="180">
                <template #default="{ row }">
                  <span class="text-sm text-dark-textSecondary">{{ row.updatedAt }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="100" align="center">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="viewNodeDetail(row)">
                    详情
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
          </div>

          <div v-show="activeTab === 'metrics'" class="space-y-6">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div class="bg-dark-bg rounded-lg p-5">
                <div class="flex items-center gap-3 mb-4">
                  <Cpu class="w-6 h-6 text-accent-400" />
                  <span class="font-medium text-dark-text">CPU 使用率分布</span>
                </div>
                <MetricChart
                  type="bar"
                  :series="cpuBarData.series"
                  :xAxisData="cpuBarData.xAxis"
                  height="250"
                />
              </div>
              <div class="bg-dark-bg rounded-lg p-5">
                <div class="flex items-center gap-3 mb-4">
                  <MemoryStick class="w-6 h-6 text-success" />
                  <span class="font-medium text-dark-text">内存使用率分布</span>
                </div>
                <MetricChart
                  type="bar"
                  :series="memoryBarData.series"
                  :xAxisData="memoryBarData.xAxis"
                  height="250"
                />
              </div>
            </div>
            <div class="bg-dark-bg rounded-lg p-5">
              <div class="flex items-center gap-3 mb-4">
                <HardDrive class="w-6 h-6 text-warning" />
                <span class="font-medium text-dark-text">磁盘使用率分布</span>
              </div>
              <MetricChart
                type="bar"
                :series="diskBarData.series"
                :xAxisData="diskBarData.xAxis"
                height="250"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="bg-dark-card rounded-lg border border-dark-border p-12 text-center">
      <Server class="w-16 h-16 mx-auto mb-4 text-dark-textSecondary opacity-30" />
      <p class="text-dark-textSecondary">机房不存在或已被删除</p>
      <el-button class="mt-4" @click="goBack">返回列表</el-button>
    </div>
  </div>
</template>

<script lang="ts">
import { ElMessage, ElButton, ElSkeleton, ElTag, ElTable, ElTableColumn } from 'element-plus'

export default {
  components: {
    ElMessage,
    ElButton,
    ElSkeleton,
    ElTag,
    ElTable,
    ElTableColumn
  }
}
</script>

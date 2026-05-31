<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useNodeStore } from '@/store/node'
import NodeTree from '@/components/NodeTree.vue'
import type { NodeInfo } from '@/types'
import {
  Eye,
  RefreshCw,
  Maximize2,
  Server,
  Cpu,
  HardDrive,
  MemoryStick,
  Network
} from 'lucide-vue-next'

const router = useRouter()
const nodeStore = useNodeStore()

const selectedNode = ref<NodeInfo | null>(null)
const loading = ref(false)
const nodeTreeRef = ref<InstanceType<typeof NodeTree> | null>(null)

function handleNodeSelect(node: NodeInfo) {
  selectedNode.value = node
  nodeStore.selectNode(node)
}

function viewDetail() {
  if (selectedNode.value) {
    router.push(`/topology/${selectedNode.value.id}`)
  }
}

function refresh() {
  nodeTreeRef.value?.refresh()
  nodeStore.fetchStats()
}

function formatUptime(seconds: number): string {
  if (!seconds) return '0秒'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${mins}分钟`
  return `${mins}分钟`
}

onMounted(() => {
  nodeStore.fetchStats()
})
</script>

<template>
  <div class="topology-page h-[calc(100vh-180px)]">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h2 class="text-xl font-bold text-dark-text">节点链路</h2>
        <p class="text-sm text-dark-textSecondary mt-1">树状展示节点层级关系与实时状态</p>
      </div>
      <div class="flex gap-2">
        <button
          class="px-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors flex items-center gap-2"
          @click="refresh"
        >
          <RefreshCw class="w-4 h-4" />
          刷新
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-4 gap-6 h-full">
      <div class="lg:col-span-1">
      >
        <NodeTree ref="nodeTreeRef" @node-select="handleNodeSelect" />
      </div>

      <div class="lg:col-span-3 space-y-6">
        <div v-if="selectedNode" class="bg-dark-card rounded-lg border border-dark-border p-6">
          <div class="flex items-start justify-between mb-6">
            <div class="flex items-center gap-4">
              <div class="w-16 h-16 rounded-xl bg-primary-600 flex items-center justify-center">
                <Server class="w-8 h-8 text-white" />
              </div>
              <div>
                <h3 class="text-xl font-bold text-dark-text">{{ selectedNode.name }}</h3>
                <p class="text-sm text-dark-textSecondary mt-1 font-mono">{{ selectedNode.ip }}</p>
              </div>
            </div>
            <div class="flex gap-2">
              <el-tag size="large" :type="selectedNode.status === 'online' ? 'success' : selectedNode.status === 'warning' ? 'warning' : selectedNode.status === 'error' ? 'danger' : 'info'">
                {{ nodeStore.getNodeStatusText(selectedNode.status) }}
              </el-tag>
              <button
                class="px-3 py-1.5 bg-accent-500 hover:bg-accent-600 text-white text-sm rounded-lg transition-colors flex items-center gap-1"
                @click="viewDetail"
              >
                <Eye class="w-4 h-4" />
                查看详情
              </button>
            </div>
          </div>

          <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div class="bg-dark-bg rounded-lg p-4 text-center">
              <Cpu class="w-8 h-8 mx-auto mb-2 text-accent-400" />
              <div class="text-2xl font-bold font-mono"
                   :class="(selectedNode.cpuUsage || 0) > 80 ? 'text-danger' : (selectedNode.cpuUsage || 0) > 60 ? 'text-warning' : 'text-success'">
                {{ selectedNode.cpuUsage?.toFixed(1) }}%
              </div>
              <div class="text-xs text-dark-textSecondary mt-1">CPU使用率</div>
            </div>
            <div class="bg-dark-bg rounded-lg p-4 text-center">
              <MemoryStick class="w-8 h-8 mx-auto mb-2 text-success" />
              <div class="text-2xl font-bold font-mono"
                   :class="(selectedNode.memoryUsage || 0) > 80 ? 'text-danger' : (selectedNode.memoryUsage || 0) > 60 ? 'text-warning' : 'text-success'">
                {{ selectedNode.memoryUsage?.toFixed(1) }}%
              </div>
              <div class="text-xs text-dark-textSecondary mt-1">内存使用率</div>
            </div>
            <div class="bg-dark-bg rounded-lg p-4 text-center">
              <HardDrive class="w-8 h-8 mx-auto mb-2 text-warning" />
              <div class="text-2xl font-bold font-mono"
                   :class="(selectedNode.diskUsage || 0) > 80 ? 'text-danger' : (selectedNode.diskUsage || 0) > 60 ? 'text-warning' : 'text-success'">
                {{ selectedNode.diskUsage?.toFixed(1) }}%
              </div>
              <div class="text-xs text-dark-textSecondary mt-1">磁盘使用率</div>
            </div>
            <div class="bg-dark-bg rounded-lg p-4 text-center">
              <Network class="w-8 h-8 mx-auto mb-2 text-info" />
              <div class="text-2xl font-bold font-mono text-info">
                {{ formatUptime(selectedNode.uptime || 0) }}
              </div>
              <div class="text-xs text-dark-textSecondary mt-1">运行时间</div>
            </div>
          </div>

          <div class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 class="text-sm font-medium text-dark-text mb-3">基础信息</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-dark-textSecondary">节点ID</span>
                <span class="font-mono">{{ selectedNode.id }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dark-textSecondary">所属机房</span>
                <span>{{ selectedNode.roomId }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dark-textSecondary">父节点</span>
                <span>{{ selectedNode.parentId || '无' }}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-dark-textSecondary">创建时间</span>
                <span>{{ selectedNode.createdAt }}</span>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="bg-dark-card rounded-lg border border-dark-border p-12 text-center">
          <Server class="w-16 h-16 mx-auto mb-4 text-dark-textSecondary opacity-30" />
          <p class="text-dark-textSecondary">请从左侧选择节点查看详情</p>
        </div>
      </div>
    </div>
  </div>
</template>

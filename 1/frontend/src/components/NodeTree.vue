<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useNodeStore } from '@/store/node'
import { useRoomStore } from '@/store/room'
import VirtualScroll from '@/components/VirtualScroll.vue'
import type { NodeInfo } from '@/types'
import {
  Server,
  Activity,
  ChevronRight,
  ChevronDown,
  Circle,
  RefreshCw,
  Search
} from 'lucide-vue-next'

const props = defineProps({
  showRoom: { type: Boolean, default: false },
  roomId: { type: String, default: undefined },
  enableVirtualScroll: { type: Boolean, default: true }
})

const emit = defineEmits<{
  nodeSelect: [node: NodeInfo]
}>()

const nodeStore = useNodeStore()
const roomStore = useRoomStore()

const expandedKeys = ref<Set<string>>(new Set())
const selectedNodeId = ref<string | null>(null)
const loading = ref(false)
const searchQuery = ref('')

const TREE_ITEM_HEIGHT = 40
const VIRTUAL_SCROLL_MAX_HEIGHT = 400

interface TreeItem {
  id: string
  name: string
  type?: string
  status: string
  ip?: string
  cpuUsage?: number
  memoryUsage?: number
  diskUsage?: number
  uptime?: number
  children?: TreeItem[]
  nodeCount?: number
  location?: string
  region?: string
}

interface FlatTreeNode {
  item: TreeItem
  level: number
}

const statusColors: Record<string, string> = {
  online: 'text-success',
  warning: 'text-warning',
  error: 'text-danger',
  offline: 'text-dark-textSecondary',
  active: 'text-success',
  maintenance: 'text-warning'
}

const statusBgColors: Record<string, string> = {
  online: 'bg-success',
  warning: 'bg-warning',
  error: 'bg-danger',
  offline: 'bg-dark-textSecondary',
  active: 'bg-success',
  maintenance: 'bg-warning'
}

function safeTreeData(raw: any): TreeItem[] {
  if (!raw || !Array.isArray(raw)) return []
  return raw.map(normalizeItem).filter(Boolean)
}

function normalizeItem(item: any): TreeItem | null {
  if (!item || !item.id) return null
  return {
    id: String(item.id),
    name: item.name || '未命名',
    type: item.type || (item.nodeCount !== undefined ? 'room' : 'node'),
    status: item.status || 'offline',
    ip: item.ip || undefined,
    cpuUsage: item.cpuUsage ?? undefined,
    memoryUsage: item.memoryUsage ?? undefined,
    diskUsage: item.diskUsage ?? undefined,
    uptime: item.uptime ?? undefined,
    children: safeTreeData(item.children),
    nodeCount: item.nodeCount ?? undefined,
    location: item.location || undefined,
    region: item.region || undefined
  }
}

const treeData = computed<TreeItem[]>(() => {
  try {
    if (props.showRoom) {
      const raw = roomStore.treeData
      return safeTreeData(raw)
    }
    if (props.roomId) {
      const raw = roomStore.treeData
      const targetRoom = Array.isArray(raw)
        ? raw.find((r: any) => String(r.id) === String(props.roomId))
        : null
      if (targetRoom && targetRoom.children) {
        return safeTreeData(targetRoom.children)
      }
      return []
    }
    return safeTreeData(nodeStore.treeData)
  } catch (error) {
    console.error('NodeTree 数据解析异常:', error)
    return []
  }
})

function flattenTree(nodes: TreeItem[], level: number = 0): FlatTreeNode[] {
  const result: FlatTreeNode[] = []
  for (const node of nodes) {
    result.push({ item: node, level })
    if (hasChildren(node) && isExpanded(node.id)) {
      result.push(...flattenTree(node.children!, level + 1))
    }
  }
  return result
}

const filteredFlatNodes = computed<FlatTreeNode[]>(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return []
  const result: FlatTreeNode[] = []
  function searchNodes(nodes: TreeItem[], level: number) {
    for (const node of nodes) {
      const matchesQuery =
        node.name.toLowerCase().includes(query) ||
        (node.ip && node.ip.toLowerCase().includes(query)) ||
        node.status.toLowerCase().includes(query)
      if (matchesQuery) {
        result.push({ item: node, level })
      }
      if (hasChildren(node)) {
        searchNodes(node.children!, matchesQuery ? level + 1 : level)
      }
    }
  }
  searchNodes(treeData.value, 0)
  return result
})

const isSearchActive = computed(() => searchQuery.value.trim().length > 0)

function toggleExpand(id: string, e?: Event) {
  if (e) e.stopPropagation()
  if (expandedKeys.value.has(id)) {
    expandedKeys.value.delete(id)
  } else {
    expandedKeys.value.add(id)
  }
}

function isExpanded(id: string): boolean {
  return expandedKeys.value.has(id)
}

function selectNode(node: TreeItem) {
  if (node.type === 'room') return
  selectedNodeId.value = node.id
  emit('nodeSelect', node as unknown as NodeInfo)
}

function isRoom(node: TreeItem): boolean {
  return node.type === 'room'
}

function hasChildren(node: TreeItem): boolean {
  return !!(node.children && node.children.length > 0)
}

function getStatusColor(status: string): string {
  return statusColors[status] || 'text-dark-textSecondary'
}

function getStatusBgColor(status: string): string {
  return statusBgColors[status] || 'bg-dark-textSecondary'
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0秒'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天${hours}小时`
  if (hours > 0) return `${hours}小时${mins}分钟`
  return `${mins}分钟`
}

function getRoomTagType(status: string): string {
  if (status === 'active') return 'success'
  if (status === 'maintenance') return 'warning'
  return 'info'
}

function getRoomStatusText(status: string): string {
  const texts: Record<string, string> = {
    active: '运行中',
    maintenance: '维护中',
    offline: '离线'
  }
  return texts[status] || '未知'
}

function getVirtualScrollHeight(count: number): string {
  return Math.min(count * TREE_ITEM_HEIGHT, VIRTUAL_SCROLL_MAX_HEIGHT) + 'px'
}

function shouldUseVirtualScrollForChildren(children: TreeItem[]): boolean {
  return props.enableVirtualScroll && children.length > 30
}

async function fetchData() {
  loading.value = true
  try {
    if (props.showRoom || props.roomId) {
      await roomStore.fetchTree()
    } else {
      await nodeStore.fetchTree()
    }
  } catch (error) {
    console.error('NodeTree 数据加载异常:', error)
  } finally {
    loading.value = false
  }
}

function findNode(id: string, nodes: TreeItem[]): TreeItem | null {
  if (!nodes || !Array.isArray(nodes)) return null
  for (const node of nodes) {
    if (!node) continue
    if (node.id === id) return node
    if (node.children && node.children.length > 0) {
      const found = findNode(id, node.children)
      if (found) return found
    }
  }
  return null
}

const selectedNode = computed(() => {
  if (!selectedNodeId.value) return null
  return findNode(selectedNodeId.value, treeData.value)
})

onMounted(() => {
  fetchData()
})

watch(() => props.showRoom, () => {
  fetchData()
})

watch(() => props.roomId, () => {
  if (props.roomId) {
    fetchData()
  }
})

defineExpose({
  refresh: fetchData
})
</script>

<template>
  <div class="node-tree bg-dark-card rounded-lg border border-dark-border overflow-hidden">
    <div class="p-4 border-b border-dark-border flex items-center justify-between">
      <h3 class="font-medium flex items-center gap-2">
        <Activity class="w-4 h-4 text-accent-400" />
        {{ showRoom ? '机房节点树' : roomId ? '机房节点' : '节点链路树' }}
      </h3>
      <el-button size="small" type="primary" @click="fetchData" :loading="loading">
        <template #icon>
          <RefreshCw class="w-4 h-4" />
        </template>
        刷新
      </el-button>
    </div>

    <div class="px-3 py-2 border-b border-dark-border">
      <el-input
        v-model="searchQuery"
        placeholder="搜索节点名称/IP/状态..."
        size="small"
        clearable
        :prefix-icon="Search"
      />
    </div>

    <div class="p-2 max-h-[calc(100vh-380px)] overflow-auto">
      <div v-loading="loading" class="loading-wrapper min-h-[200px]">
        <div v-if="!loading && treeData.length === 0" class="empty-state p-8 text-center text-dark-textSecondary">
          <Server class="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>暂无节点数据</p>
        </div>

        <div v-else-if="!loading && isSearchActive">
          <div v-if="filteredFlatNodes.length === 0" class="p-8 text-center text-dark-textSecondary">
            <Search class="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>未找到匹配节点</p>
          </div>
          <VirtualScroll
            v-else-if="enableVirtualScroll && filteredFlatNodes.length > 30"
            :items="filteredFlatNodes"
            :item-height="TREE_ITEM_HEIGHT"
            container-height="100%"
          >
            <template #default="{ item: flatNode }">
              <div
                :class="[
                  'node-item flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-all duration-200 hover:bg-dark-border',
                  selectedNodeId === flatNode.item.id ? 'bg-accent-500/20 border border-accent-500/30' : ''
                ]"
                :style="({ paddingLeft: `${12 + flatNode.level * 16}px` } as any)"
                @click="selectNode(flatNode.item)"
              >
                <span v-if="hasChildren(flatNode.item)"
                      class="expand-icon w-5 h-5 flex items-center justify-center text-dark-textSecondary hover:text-accent-400 shrink-0"
                      @click.stop="toggleExpand(flatNode.item.id)">
                  <ChevronDown v-if="isExpanded(flatNode.item.id)" class="w-4 h-4" />
                  <ChevronRight v-else class="w-4 h-4" />
                </span>
                <span v-else class="w-5 h-5 shrink-0" />

                <Server v-if="isRoom(flatNode.item)" class="w-4 h-4 text-primary-400 shrink-0" />
                <div v-else class="relative shrink-0">
                  <Circle :class="['w-4 h-4', getStatusColor(flatNode.item.status)]" fill="currentColor" />
                  <div :class="['absolute inset-0 rounded-full animate-breathe opacity-30', getStatusBgColor(flatNode.item.status)]" />
                </div>

                <span :class="['flex-1 truncate text-sm min-w-0', isRoom(flatNode.item) ? 'font-medium' : '']">
                  {{ flatNode.item.name }}
                </span>

                <span v-if="!isRoom(flatNode.item) && flatNode.item.ip" class="text-xs text-dark-textSecondary font-mono shrink-0">
                  {{ flatNode.item.ip }}
                </span>

                <el-tag v-if="isRoom(flatNode.item)" size="small" :type="getRoomTagType(flatNode.item.status)">
                  {{ getRoomStatusText(flatNode.item.status) }}
                </el-tag>
              </div>
            </template>
          </VirtualScroll>
          <div v-else class="space-y-0.5">
            <div
              v-for="flatNode in filteredFlatNodes"
              :key="flatNode.item.id"
              :class="[
                'node-item flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-all duration-200 hover:bg-dark-border',
                selectedNodeId === flatNode.item.id ? 'bg-accent-500/20 border border-accent-500/30' : ''
              ]"
              :style="({ paddingLeft: `${12 + flatNode.level * 16}px` } as any)"
              @click="selectNode(flatNode.item)"
            >
              <span v-if="hasChildren(flatNode.item)"
                    class="expand-icon w-5 h-5 flex items-center justify-center text-dark-textSecondary hover:text-accent-400 shrink-0"
                    @click.stop="toggleExpand(flatNode.item.id)">
                <ChevronDown v-if="isExpanded(flatNode.item.id)" class="w-4 h-4" />
                <ChevronRight v-else class="w-4 h-4" />
              </span>
              <span v-else class="w-5 h-5 shrink-0" />

              <Server v-if="isRoom(flatNode.item)" class="w-4 h-4 text-primary-400 shrink-0" />
              <div v-else class="relative shrink-0">
                <Circle :class="['w-4 h-4', getStatusColor(flatNode.item.status)]" fill="currentColor" />
                <div :class="['absolute inset-0 rounded-full animate-breathe opacity-30', getStatusBgColor(flatNode.item.status)]" />
              </div>

              <span :class="['flex-1 truncate text-sm min-w-0', isRoom(flatNode.item) ? 'font-medium' : '']">
                {{ flatNode.item.name }}
              </span>

              <span v-if="!isRoom(flatNode.item) && flatNode.item.ip" class="text-xs text-dark-textSecondary font-mono shrink-0">
                {{ flatNode.item.ip }}
              </span>

              <el-tag v-if="isRoom(flatNode.item)" size="small" :type="getRoomTagType(flatNode.item.status)">
                {{ getRoomStatusText(flatNode.item.status) }}
              </el-tag>
            </div>
          </div>
        </div>

        <div v-else-if="!loading" class="space-y-0.5">
          <template v-for="node in treeData" :key="node.id">
            <div
              :class="[
                'node-item flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-all duration-200 hover:bg-dark-border',
                selectedNodeId === node.id ? 'bg-accent-500/20 border border-accent-500/30' : ''
              ]"
              @click="selectNode(node)"
            >
              <span v-if="hasChildren(node)"
                    class="expand-icon w-5 h-5 flex items-center justify-center text-dark-textSecondary hover:text-accent-400 shrink-0"
                    @click.stop="toggleExpand(node.id)">
                <ChevronDown v-if="isExpanded(node.id)" class="w-4 h-4" />
                <ChevronRight v-else class="w-4 h-4" />
              </span>
              <span v-else class="w-5 h-5 shrink-0" />

              <Server v-if="isRoom(node)" class="w-4 h-4 text-primary-400 shrink-0" />
              <div v-else class="relative shrink-0">
                <Circle :class="['w-4 h-4', getStatusColor(node.status)]" fill="currentColor" />
                <div :class="['absolute inset-0 rounded-full animate-breathe opacity-30', getStatusBgColor(node.status)]" />
              </div>

              <span :class="['flex-1 truncate text-sm min-w-0', isRoom(node) ? 'font-medium' : '']">
                {{ node.name }}
              </span>

              <span v-if="!isRoom(node) && node.ip" class="text-xs text-dark-textSecondary font-mono shrink-0">
                {{ node.ip }}
              </span>

              <el-tag v-if="isRoom(node)" size="small" :type="getRoomTagType(node.status)">
                {{ getRoomStatusText(node.status) }}
              </el-tag>
            </div>

            <div v-if="hasChildren(node) && isExpanded(node.id)" class="ml-4">
              <VirtualScroll
                v-if="shouldUseVirtualScrollForChildren(node.children!)"
                :items="node.children!"
                :item-height="TREE_ITEM_HEIGHT"
                :container-height="getVirtualScrollHeight(node.children!.length)"
              >
                <template #default="{ item: child }">
                  <div
                    :class="[
                      'node-item flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-all duration-200 hover:bg-dark-border',
                      selectedNodeId === child.id ? 'bg-accent-500/20 border border-accent-500/30' : ''
                    ]"
                    @click="selectNode(child)"
                  >
                    <span v-if="hasChildren(child)"
                          class="expand-icon w-5 h-5 flex items-center justify-center text-dark-textSecondary hover:text-accent-400 shrink-0"
                          @click.stop="toggleExpand(child.id)">
                      <ChevronDown v-if="isExpanded(child.id)" class="w-4 h-4" />
                      <ChevronRight v-else class="w-4 h-4" />
                    </span>
                    <span v-else class="w-5 h-5 shrink-0" />

                    <Server v-if="isRoom(child)" class="w-4 h-4 text-primary-400 shrink-0" />
                    <div v-else class="relative shrink-0">
                      <Circle :class="['w-4 h-4', getStatusColor(child.status)]" fill="currentColor" />
                      <div :class="['absolute inset-0 rounded-full animate-breathe opacity-30', getStatusBgColor(child.status)]" />
                    </div>

                    <span :class="['flex-1 truncate text-sm min-w-0', isRoom(child) ? 'font-medium' : '']">
                      {{ child.name }}
                    </span>

                    <span v-if="!isRoom(child) && child.ip" class="text-xs text-dark-textSecondary font-mono shrink-0">
                      {{ child.ip }}
                    </span>

                    <el-tag v-if="isRoom(child)" size="small" :type="getRoomTagType(child.status)">
                      {{ getRoomStatusText(child.status) }}
                    </el-tag>
                  </div>
                </template>
              </VirtualScroll>

              <template v-else>
                <template v-for="child in node.children" :key="child.id">
                  <div
                    :class="[
                      'node-item flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-all duration-200 hover:bg-dark-border',
                      selectedNodeId === child.id ? 'bg-accent-500/20 border border-accent-500/30' : ''
                    ]"
                    @click="selectNode(child)"
                  >
                    <span v-if="hasChildren(child)"
                          class="expand-icon w-5 h-5 flex items-center justify-center text-dark-textSecondary hover:text-accent-400 shrink-0"
                          @click.stop="toggleExpand(child.id)">
                      <ChevronDown v-if="isExpanded(child.id)" class="w-4 h-4" />
                      <ChevronRight v-else class="w-4 h-4" />
                    </span>
                    <span v-else class="w-5 h-5 shrink-0" />

                    <Server v-if="isRoom(child)" class="w-4 h-4 text-primary-400 shrink-0" />
                    <div v-else class="relative shrink-0">
                      <Circle :class="['w-4 h-4', getStatusColor(child.status)]" fill="currentColor" />
                      <div :class="['absolute inset-0 rounded-full animate-breathe opacity-30', getStatusBgColor(child.status)]" />
                    </div>

                    <span :class="['flex-1 truncate text-sm min-w-0', isRoom(child) ? 'font-medium' : '']">
                      {{ child.name }}
                    </span>

                    <span v-if="!isRoom(child) && child.ip" class="text-xs text-dark-textSecondary font-mono shrink-0">
                      {{ child.ip }}
                    </span>

                    <el-tag v-if="isRoom(child)" size="small" :type="getRoomTagType(child.status)">
                      {{ getRoomStatusText(child.status) }}
                    </el-tag>
                  </div>

                  <div v-if="hasChildren(child) && isExpanded(child.id)" class="ml-4">
                    <VirtualScroll
                      v-if="shouldUseVirtualScrollForChildren(child.children!)"
                      :items="child.children!"
                      :item-height="TREE_ITEM_HEIGHT"
                      :container-height="getVirtualScrollHeight(child.children!.length)"
                    >
                      <template #default="{ item: grandChild }">
                        <div
                          :class="[
                            'node-item flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-all duration-200 hover:bg-dark-border',
                            selectedNodeId === grandChild.id ? 'bg-accent-500/20 border border-accent-500/30' : ''
                          ]"
                          @click="selectNode(grandChild)"
                        >
                          <span v-if="hasChildren(grandChild)"
                                class="expand-icon w-5 h-5 flex items-center justify-center text-dark-textSecondary hover:text-accent-400 shrink-0"
                                @click.stop="toggleExpand(grandChild.id)">
                            <ChevronDown v-if="isExpanded(grandChild.id)" class="w-4 h-4" />
                            <ChevronRight v-else class="w-4 h-4" />
                          </span>
                          <span v-else class="w-5 h-5 shrink-0" />

                          <div class="relative shrink-0">
                            <Circle :class="['w-4 h-4', getStatusColor(grandChild.status)]" fill="currentColor" />
                            <div :class="['absolute inset-0 rounded-full animate-breathe opacity-30', getStatusBgColor(grandChild.status)]" />
                          </div>
                          <span class="flex-1 truncate text-sm min-w-0">{{ grandChild.name }}</span>
                          <span v-if="grandChild.ip" class="text-xs text-dark-textSecondary font-mono shrink-0">{{ grandChild.ip }}</span>
                        </div>
                      </template>
                    </VirtualScroll>

                    <template v-else>
                      <template v-for="grandChild in child.children" :key="grandChild.id">
                        <div
                          :class="[
                            'node-item flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-all duration-200 hover:bg-dark-border',
                            selectedNodeId === grandChild.id ? 'bg-accent-500/20 border border-accent-500/30' : ''
                          ]"
                          @click="selectNode(grandChild)"
                        >
                          <span v-if="hasChildren(grandChild)"
                                class="expand-icon w-5 h-5 flex items-center justify-center text-dark-textSecondary hover:text-accent-400 shrink-0"
                                @click.stop="toggleExpand(grandChild.id)">
                            <ChevronDown v-if="isExpanded(grandChild.id)" class="w-4 h-4" />
                            <ChevronRight v-else class="w-4 h-4" />
                          </span>
                          <span v-else class="w-5 h-5 shrink-0" />

                          <div class="relative shrink-0">
                            <Circle :class="['w-4 h-4', getStatusColor(grandChild.status)]" fill="currentColor" />
                            <div :class="['absolute inset-0 rounded-full animate-breathe opacity-30', getStatusBgColor(grandChild.status)]" />
                          </div>
                          <span class="flex-1 truncate text-sm min-w-0">{{ grandChild.name }}</span>
                          <span v-if="grandChild.ip" class="text-xs text-dark-textSecondary font-mono shrink-0">{{ grandChild.ip }}</span>
                        </div>
                      </template>
                    </template>
                  </div>
                </template>
              </template>
            </div>
          </template>
        </div>
      </div>
    </div>

    <div v-if="selectedNode && !isRoom(selectedNode)" class="p-4 border-t border-dark-border bg-dark-bg/50">
      <div class="space-y-2 text-sm">
        <div class="flex justify-between">
          <span class="text-dark-textSecondary">状态</span>
          <el-tag size="small"
                  :type="selectedNode.status === 'online' ? 'success' : selectedNode.status === 'warning' ? 'warning' : selectedNode.status === 'error' ? 'danger' : 'info'">
            {{ nodeStore.getNodeStatusText(selectedNode.status as any) }}
          </el-tag>
        </div>
        <div class="flex justify-between">
          <span class="text-dark-textSecondary">CPU</span>
          <span class="font-mono"
                :class="(selectedNode.cpuUsage || 0) > 80 ? 'text-danger' : (selectedNode.cpuUsage || 0) > 60 ? 'text-warning' : 'text-success'">
            {{ selectedNode.cpuUsage != null ? selectedNode.cpuUsage.toFixed(1) + '%' : '-' }}
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-dark-textSecondary">内存</span>
          <span class="font-mono"
                :class="(selectedNode.memoryUsage || 0) > 80 ? 'text-danger' : (selectedNode.memoryUsage || 0) > 60 ? 'text-warning' : 'text-success'">
            {{ selectedNode.memoryUsage != null ? selectedNode.memoryUsage.toFixed(1) + '%' : '-' }}
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-dark-textSecondary">磁盘</span>
          <span class="font-mono"
                :class="(selectedNode.diskUsage || 0) > 80 ? 'text-danger' : (selectedNode.diskUsage || 0) > 60 ? 'text-warning' : 'text-success'">
            {{ selectedNode.diskUsage != null ? selectedNode.diskUsage.toFixed(1) + '%' : '-' }}
          </span>
        </div>
        <div class="flex justify-between">
          <span class="text-dark-textSecondary">运行时间</span>
          <span class="font-mono">{{ formatUptime(selectedNode.uptime || 0) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.node-item:hover {
  background-color: rgba(0, 212, 255, 0.05);
}

.animate-breathe {
  animation: breathe 2s ease-in-out infinite;
}

@keyframes breathe {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}
</style>

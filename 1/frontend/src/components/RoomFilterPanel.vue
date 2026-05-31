<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoomStore } from '@/store/room'
import type { RoomInfo, RoomStatus } from '@/types'
import {
  Filter,
  Search,
  MapPin,
  Server,
  Activity,
  RefreshCw,
  Play,
  Pause,
  ChevronRight,
  X
} from 'lucide-vue-next'

const emit = defineEmits<{
  filterChange: [filters: any]
  roomSelect: [room: RoomInfo]
}>()

const roomStore = useRoomStore()

const showPanel = ref(true)
const loading = ref(false)
const selectedRoomId = ref<string | null>(null)

const filters = ref({
  keyword: '',
  region: '',
  status: ''
})

const regions = [
  { code: 'north', name: '华北' },
  { code: 'south', name: '华南' },
  { code: 'east', name: '华东' },
  { code: 'west', name: '西部' },
  { code: 'central', name: '华中' }
]

const statusOptions = [
  { value: 'active', label: '运行中' },
  { value: 'maintenance', label: '维护中' },
  { value: 'offline', label: '离线' }
]

const filteredRooms = computed(() => {
  let result = [...roomStore.rooms]
  
  if (filters.value.keyword) {
    const kw = filters.value.keyword.toLowerCase()
    result = result.filter(r => 
      r.name.toLowerCase().includes(kw) || 
      r.location.toLowerCase().includes(kw)
    )
  }
  if (filters.value.region) {
    result = result.filter(r => r.region === filters.value.region)
  }
  if (filters.value.status) {
    result = result.filter(r => r.status === filters.value.status)
  }
  
  return result
})

function applyFilters() {
  roomStore.setFilter({
    keyword: filters.value.keyword || undefined,
    region: filters.value.region || undefined,
    status: (filters.value.status as RoomStatus) || undefined
  })
  emit('filterChange', filters.value)
}

function resetFilters() {
  filters.value = {
    keyword: '',
    region: '',
    status: ''
  }
  roomStore.resetFilter()
  emit('filterChange', {})
}

async function fetchRooms() {
  loading.value = true
  try {
    await roomStore.fetchRooms()
  } finally {
    loading.value = false
  }
}

function selectRoom(room: RoomInfo) {
  selectedRoomId.value = room.id
  roomStore.selectRoom(room)
  emit('roomSelect', room)
}

function getRegionName(code: string): string {
  const region = regions.find(r => r.code === code)
  return region?.name || code
}

function getStatusType(status: RoomStatus): 'success' | 'warning' | 'info' {
  const types: Record<RoomStatus, 'success' | 'warning' | 'info'> = {
    active: 'success',
    maintenance: 'warning',
    offline: 'info'
  }
  return types[status] || 'info'
}

function getStatusText(status: RoomStatus): string {
  const texts: Record<RoomStatus, string> = {
    active: '运行中',
    maintenance: '维护中',
    offline: '离线'
  }
  return texts[status] || '未知'
}

async function handleBatchControl(room: RoomInfo, action: 'start' | 'pause') {
  try {
    const { batchControlNodes } = await import('@/api/room')
    const res = await batchControlNodes(room.id, action)
    if (res.code === 200) {
      ElMessage.success(`${action === 'start' ? '启动' : '暂停'}采集任务成功`)
      fetchRooms()
    }
  } catch (error) {
    console.error('批量控制失败:', error)
  }
}

onMounted(() => {
  fetchRooms()
})

defineExpose({
  refresh: fetchRooms
})
</script>

<template>
  <div class="room-filter-panel h-full flex">
    <div
      :class="[
        'filter-panel bg-dark-card rounded-lg border border-dark-border overflow-hidden transition-all duration-300 flex flex-col',
        showPanel ? 'w-80' : 'w-0 opacity-0'
      ]"
    >
      <div class="p-4 border-b border-dark-border flex items-center justify-between">
        <h3 class="font-medium flex items-center gap-2">
          <Filter class="w-4 h-4 text-accent-400" />
          机房筛选
        </h3>
        <button
          class="p-1 rounded hover:bg-dark-border text-dark-textSecondary hover:text-dark-text transition-colors"
          @click="showPanel = false"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <div class="p-4 border-b border-dark-border space-y-4">
        <div class="relative">
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-textSecondary" />
          <input
            v-model="filters.keyword"
            type="text"
            placeholder="搜索机房名称/位置..."
            class="w-full pl-10 pr-4 py-2 bg-dark-bg border border-dark-border rounded text-sm text-dark-text placeholder-dark-textSecondary focus:outline-none focus:border-accent-500 transition-colors"
            @keyup.enter="applyFilters"
          />
        </div>

        <div>
          <label class="block text-xs text-dark-textSecondary mb-2">区域</label>
          <select
            v-model="filters.region"
            class="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-dark-text focus:outline-none focus:border-accent-500 transition-colors"
          >
            <option value="">全部区域</option>
            <option v-for="r in regions" :key="r.code" :value="r.code">{{ r.name }}</option>
          </select>
        </div>

        <div>
          <label class="block text-xs text-dark-textSecondary mb-2">状态</label>
          <select
            v-model="filters.status"
            class="w-full px-3 py-2 bg-dark-bg border border-dark-border rounded text-sm text-dark-text focus:outline-none focus:border-accent-500 transition-colors"
          >
            <option value="">全部状态</option>
            <option v-for="s in statusOptions" :key="s.value" :value="s.value">{{ s.label }}</option>
          </select>
        </div>

        <div class="flex gap-2">
          <button
            class="flex-1 px-4 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded text-sm transition-colors"
            @click="applyFilters"
          >
            应用筛选
          </button>
          <button
            class="px-4 py-2 bg-dark-border hover:bg-dark-border/80 text-dark-text rounded text-sm transition-colors"
            @click="resetFilters"
          >
            重置
          </button>
        </div>
      </div>

      <div class="p-4 border-b border-dark-border flex items-center justify-between">
        <span class="text-sm text-dark-textSecondary">
          共 <span class="text-accent-400 font-medium">{{ filteredRooms.length }}</span> 个机房
        </span>
        <button
          class="p-1.5 rounded hover:bg-dark-border text-dark-textSecondary hover:text-accent-400 transition-colors"
          @click="fetchRooms"
          :class="{ 'animate-spin': loading }"
        >
          <RefreshCw class="w-4 h-4" />
        </button>
      </div>

      <div class="flex-1 overflow-auto p-2 space-y-2">
        <div
          v-for="room in filteredRooms"
          :key="room.id"
          :class="[
            'room-card p-3 rounded border cursor-pointer transition-all duration-200',
            selectedRoomId === room.id
              ? 'bg-accent-500/10 border-accent-500/30'
              : 'bg-dark-bg border-dark-border hover:border-accent-500/30'
          ]"
          @click="selectRoom(room)"
        >
          <div class="flex items-start justify-between mb-2">
            <div class="flex items-center gap-2">
              <Server class="w-4 h-4 text-primary-400" />
              <span class="font-medium text-sm">{{ room.name }}</span>
            </div>
            <el-tag size="small" :type="getStatusType(room.status)">
              {{ getStatusText(room.status) }}
            </el-tag>
          </div>

          <div class="flex items-center gap-1 text-xs text-dark-textSecondary mb-2">
            <MapPin class="w-3 h-3" />
            <span>{{ room.location }}</span>
            <span class="mx-1">·</span>
            <span>{{ getRegionName(room.region) }}</span>
          </div>

          <div class="flex items-center gap-4 text-xs mb-3">
            <div class="flex items-center gap-1">
              <span class="text-dark-textSecondary">节点:</span>
              <span class="text-dark-text">{{ room.nodeCount }}</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-success">●</span>
              <span class="text-dark-text">{{ room.onlineCount }}</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-warning">●</span>
              <span class="text-dark-text">{{ room.warningCount }}</span>
            </div>
            <div class="flex items-center gap-1">
              <span class="text-danger">●</span>
              <span class="text-dark-text">{{ room.errorCount }}</span>
            </div>
          </div>

          <div class="flex gap-2">
            <button
              class="flex-1 px-2 py-1 bg-success/10 hover:bg-success/20 text-success rounded text-xs transition-colors flex items-center justify-center gap-1"
              @click.stop="handleBatchControl(room, 'start')"
            >
              <Play class="w-3 h-3" />
              启动采集
            </button>
            <button
              class="flex-1 px-2 py-1 bg-warning/10 hover:bg-warning/20 text-warning rounded text-xs transition-colors flex items-center justify-center gap-1"
              @click.stop="handleBatchControl(room, 'pause')"
            >
              <Pause class="w-3 h-3" />
              暂停采集
            </button>
            <button
              class="px-2 py-1 bg-dark-border hover:bg-dark-border/80 text-dark-text rounded text-xs transition-colors flex items-center justify-center"
              @click.stop="emit('roomSelect', room)"
            >
              <ChevronRight class="w-3 h-3" />
            </button>
          </div>
        </div>

        <div v-if="!loading && filteredRooms.length === 0" class="p-8 text-center text-dark-textSecondary">
          <Server class="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p class="text-sm">没有符合条件的机房</p>
        </div>
      </div>

      <div class="p-4 border-t border-dark-border bg-dark-bg/50">
        <div class="grid grid-cols-2 gap-3">
          <div class="text-center">
            <div class="text-lg font-bold text-accent-400">{{ roomStore.stats.total }}</div>
            <div class="text-xs text-dark-textSecondary">总机房数</div>
          </div>
          <div class="text-center">
            <div class="text-lg font-bold text-success">{{ roomStore.stats.active }}</div>
            <div class="text-xs text-dark-textSecondary">运行中</div>
          </div>
          <div class="text-center">
            <div class="text-lg font-bold text-warning">{{ roomStore.stats.maintenance }}</div>
            <div class="text-xs text-dark-textSecondary">维护中</div>
          </div>
          <div class="text-center">
            <div class="text-lg font-bold text-info">{{ roomStore.stats.offline }}</div>
            <div class="text-xs text-dark-textSecondary">离线</div>
          </div>
        </div>
      </div>
    </div>

    <button
      v-if="!showPanel"
      class="self-center -ml-0 w-8 h-16 bg-dark-card border border-l-0 border-dark-border rounded-r-lg flex items-center justify-center text-dark-textSecondary hover:text-accent-400 hover:bg-dark-border transition-colors"
      @click="showPanel = true"
    >
      <Filter class="w-4 h-4" />
    </button>
  </div>
</template>

<script lang="ts">
import { ElMessage } from 'element-plus'

export default {
  components: {
    ElMessage
  }
}
</script>

<style scoped>
.room-card:hover {
  transform: translateX(2px);
}
</style>

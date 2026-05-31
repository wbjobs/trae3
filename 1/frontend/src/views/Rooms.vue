<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useRoomStore } from '@/store/room'
import RoomFilterPanel from '@/components/RoomFilterPanel.vue'
import type { RoomInfo } from '@/types'
import {
  Server,
  MapPin,
  Activity,
  Users,
  Play,
  Pause,
  RefreshCw,
  ChevronRight
} from 'lucide-vue-next'

const router = useRouter()
const roomStore = useRoomStore()

const filterPanelRef = ref<InstanceType<typeof RoomFilterPanel> | null>(null)
const selectedRoom = ref<RoomInfo | null>(null)
const loading = ref(false)

function handleRoomSelect(room: RoomInfo) {
  selectedRoom.value = room
  roomStore.selectRoom(room)
}

function handleFilterChange(filters: any) {
  console.log('筛选条件:', filters)
}

function viewRoomDetail(room: RoomInfo) {
  router.push(`/rooms/${room.id}`)
}

function refresh() {
  filterPanelRef.value?.refresh()
  roomStore.fetchStats()
}

function getRegionName(code: string): string {
  const regions: Record<string, string> = {
    north: '华北',
    south: '华南',
    east: '华东',
    west: '华东',
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

async function handleBatchControl(room: RoomInfo, action: 'start' | 'pause') {
  try {
    const { batchControlNodes } = await import('@/api/room')
    const res = await batchControlNodes(room.id, action)
    if (res.code === 200) {
      ElMessage.success(`${action === 'start' ? '启动' : '暂停'}采集任务成功`)
      refresh()
    }
  } catch (error) {
    console.error('批量控制失败:', error)
  }
}

onMounted(() => {
  roomStore.fetchStats()
})
</script>

<template>
  <div class="rooms-page h-[calc(100vh-180px)] flex gap-6">
    <div class="flex-1 flex flex-col">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h2 class="text-xl font-bold text-dark-text">机房管理</h2>
          <p class="text-sm text-dark-textSecondary mt-1">管理各机房节点与批量操作</p>
        </div>
        <button
          class="px-4 py-2 bg-dark-card border border-dark-border rounded-lg text-sm text-dark-text hover:border-accent-500/50 hover:text-accent-400 transition-colors flex items-center gap-2"
          @click="refresh"
        >
          <RefreshCw class="w-4 h-4" />
          刷新
        </button>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div class="bg-dark-card rounded-lg border border-dark-border p-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-lg bg-accent-500/10 flex items-center justify-center">
              <Server class="w-6 h-6 text-accent-400" />
            </div>
            <div>
              <div class="text-2xl font-bold text-dark-text">{{ roomStore.stats.total || 5 }}</div>
              <div class="text-sm text-dark-textSecondary">总机房数</div>
            </div>
          </div>
        </div>
        <div class="bg-dark-card rounded-lg border border-dark-border p-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
            <Activity class="w-6 h-6 text-success" />
          </div>
          <div>
            <div class="text-2xl font-bold text-dark-text">{{ roomStore.stats.active || 4 }}</div>
            <div class="text-sm text-dark-textSecondary">运行中</div>
          </div>
        </div>
        <div class="bg-dark-card rounded-lg border border-dark-border p-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
            <Users class="w-6 h-6 text-warning" />
          </div>
          <div>
            <div class="text-2xl font-bold text-dark-text">{{ roomStore.stats.maintenance || 1 }}</div>
            <div class="text-sm text-dark-textSecondary">维护中</div>
          </div>
        </div>
        <div class="bg-dark-card rounded-lg border border-dark-border p-4">
          <div class="flex items-center gap-3">
            <div class="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center">
            <Server class="w-6 h-6 text-info" />
          </div>
          <div>
            <div class="text-2xl font-bold text-dark-text">{{ roomStore.stats.offline || 0 }}</div>
            <div class="text-sm text-dark-textSecondary">离线</div>
          </div>
        </div>
      </div>

      <div class="flex-1 overflow-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div
            v-for="room in roomStore.filteredRooms.length > 0 ? roomStore.filteredRooms : roomStore.rooms"
            :key="room.id"
            :class="[
              'bg-dark-card rounded-lg border cursor-pointer transition-all duration-200 hover:shadow-card',
              selectedRoom?.id === room.id ? 'border-accent-500/50' : 'border-dark-border hover:border-accent-500/30'
            ]"
            @click="handleRoomSelect(room)"
          >
            <div class="p-4 border-b border-dark-border">
              <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center">
                    <Server class="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 class="font-medium text-dark-text">{{ room.name }}</h4>
                    <div class="flex items-center gap-1 text-xs text-dark-textSecondary mt-1">
                      <MapPin class="w-3 h-3" />
                      <span>{{ room.location }}</span>
                      <span class="mx-1">·</span>
                      <span>{{ getRegionName(room.region) }}</span>
                    </div>
                  </div>
                </div>
                <el-tag size="small" :type="getStatusType(room.status)">
                  {{ getStatusText(room.status) }}
                </el-tag>
              </div>
              <p class="text-xs text-dark-textSecondary mt-2">{{ room.description }}</p>
            </div>
            <div class="p-4">
              <div class="grid grid-cols-4 gap-2 mb-4">
                <div class="text-center">
                  <div class="text-lg font-bold text-dark-text">{{ room.nodeCount }}</div>
                  <div class="text-xs text-dark-textSecondary">总节点</div>
                </div>
                <div class="text-center">
                  <div class="text-lg font-bold text-success">{{ room.onlineCount }}</div>
                  <div class="text-xs text-dark-textSecondary">在线</div>
                </div>
                <div class="text-center">
                  <div class="text-lg font-bold text-warning">{{ room.warningCount }}</div>
                  <div class="text-xs text-dark-textSecondary">告警</div>
                </div>
                <div class="text-center">
                  <div class="text-lg font-bold text-danger">{{ room.errorCount }}</div>
                  <div class="text-xs text-dark-textSecondary">异常</div>
                </div>
              </div>
              <div class="h-2 bg-dark-bg rounded-full overflow-hidden mb-4">
                <div
                  class="h-full bg-gradient-to-r from-success to-success/50"
                  :style="`width: ${room.nodeCount > 0 ? (room.onlineCount / room.nodeCount * 100) : 0}%`"
                />
              </div>
              <div class="flex gap-2">
                <button
                  class="flex-1 px-2 py-1.5 bg-success/10 hover:bg-success/20 text-success text-xs rounded transition-colors flex items-center justify-center gap-1"
                  @click.stop="handleBatchControl(room, 'start')"
                >
                  <Play class="w-3 h-3" />
                  启动采集
                </button>
                <button
                  class="flex-1 px-2 py-1.5 bg-warning/10 hover:bg-warning/20 text-warning text-xs rounded transition-colors flex items-center justify-center gap-1"
                  @click.stop="handleBatchControl(room, 'pause')"
                >
                  <Pause class="w-3 h-3" />
                  暂停采集
                </button>
                <button
                  class="px-2 py-1.5 bg-dark-border hover:bg-dark-border/80 text-dark-text text-xs rounded transition-colors flex items-center justify-center"
                  @click.stop="viewRoomDetail(room)"
                >
                  <ChevronRight class="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div v-if="roomStore.filteredRooms.length === 0 && roomStore.rooms.length === 0" class="p-12 text-center">
          <Server class="w-16 h-16 mx-auto mb-4 text-dark-textSecondary opacity-30" />
          <p class="text-dark-textSecondary">暂无机房数据</p>
        </div>
      </div>
    </div>

    <RoomFilterPanel
      ref="filterPanelRef"
      @filter-change="handleFilterChange"
      @room-select="handleRoomSelect"
    />
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

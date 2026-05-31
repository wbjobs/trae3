import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RoomInfo, RoomFilter, RoomStatus } from '@/types'
import { getRoomList, getRoomTree, getRoomStats, getRegions } from '@/api/room'

export const useRoomStore = defineStore('room', () => {
  const rooms = ref<RoomInfo[]>([])
  const treeData = ref<RoomInfo[]>([])
  const selectedRoom = ref<RoomInfo | null>(null)
  const loading = ref(false)
  const regions = ref<{ code: string; name: string }[]>([])
  
  const filter = ref<RoomFilter>({
    region: undefined,
    status: undefined,
    keyword: undefined
  })

  const stats = ref({
    total: 0,
    active: 0,
    maintenance: 0,
    offline: 0
  })

  const filteredRooms = computed(() => {
    let result = [...rooms.value]
    
    if (filter.value.region) {
      result = result.filter(r => r.region === filter.value.region)
    }
    if (filter.value.status) {
      result = result.filter(r => r.status === filter.value.status)
    }
    if (filter.value.keyword) {
      const kw = filter.value.keyword.toLowerCase()
      result = result.filter(r => 
        r.name.toLowerCase().includes(kw) || 
        r.location.toLowerCase().includes(kw)
      )
    }
    
    return result
  })

  async function fetchRooms(params?: any) {
    loading.value = true
    try {
      const res = await getRoomList({ page: 1, pageSize: 100, ...params })
      if (res.code === 200 && res.data) {
        rooms.value = res.data.list || []
      }
    } catch (error) {
      console.error('获取机房列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchTree() {
    loading.value = true
    try {
      const res = await getRoomTree()
      if (res.code === 200) {
        treeData.value = Array.isArray(res.data) ? res.data : []
      }
    } catch (error) {
      console.error('获取机房树失败:', error)
      treeData.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    try {
      const res = await getRoomStats()
      if (res.code === 200 && res.data) {
        stats.value = res.data || { total: 0, active: 0, maintenance: 0, offline: 0 }
      }
    } catch (error) {
      console.error('获取机房统计失败:', error)
    }
  }

  async function fetchRegions() {
    try {
      const res = await getRegions()
      if (res.code === 200) {
        regions.value = res.data
      }
    } catch (error) {
      console.error('获取区域列表失败:', error)
    }
  }

  function setFilter(newFilter: Partial<RoomFilter>) {
    filter.value = { ...filter.value, ...newFilter }
  }

  function resetFilter() {
    filter.value = {
      region: undefined,
      status: undefined,
      keyword: undefined
    }
  }

  function selectRoom(room: RoomInfo | null) {
    selectedRoom.value = room
  }

  function getRoomStatusColor(status: RoomStatus): string {
    const colors: Record<RoomStatus, string> = {
      active: 'var(--el-color-success)',
      maintenance: 'var(--el-color-warning)',
      offline: 'var(--el-color-info)'
    }
    return colors[status] || colors.offline
  }

  function getRoomStatusText(status: RoomStatus): string {
    const texts: Record<RoomStatus, string> = {
      active: '运行中',
      maintenance: '维护中',
      offline: '离线'
    }
    return texts[status] || '未知'
  }

  function getRegionName(code: string): string {
    const region = regions.value.find(r => r.code === code)
    return region?.name || code
  }

  return {
    rooms,
    treeData,
    selectedRoom,
    loading,
    stats,
    filter,
    regions,
    filteredRooms,
    fetchRooms,
    fetchTree,
    fetchStats,
    fetchRegions,
    setFilter,
    resetFilter,
    selectRoom,
    getRoomStatusColor,
    getRoomStatusText,
    getRegionName
  }
})

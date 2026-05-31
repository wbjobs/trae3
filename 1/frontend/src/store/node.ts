import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { NodeInfo, TreeNode, NodeStatus, PageQuery } from '@/types'
import { getNodeList, getNodeTree, getNodeStats } from '@/api/node'

export const useNodeStore = defineStore('node', () => {
  const nodes = ref<NodeInfo[]>([])
  const treeData = ref<TreeNode[]>([])
  const selectedNode = ref<NodeInfo | null>(null)
  const loading = ref(false)
  const hasMore = ref(true)
  const currentPage = ref(1)
  const pageSize = ref(50)
  const currentFilters = ref<Partial<PageQuery>>({})

  const stats = ref({
    total: 0,
    online: 0,
    warning: 0,
    error: 0,
    offline: 0
  })

  const onlineRate = computed(() => {
    if (stats.value.total === 0) return 0
    return Math.round((stats.value.online / stats.value.total) * 100)
  })

  async function fetchNodes(params?: any) {
    loading.value = true
    try {
      const res = await getNodeList({ page: 1, pageSize: 1000, ...params })
      if (res.code === 200 && res.data) {
        nodes.value = res.data.list || []
      }
    } catch (error) {
      console.error('获取节点列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function fetchTree() {
    loading.value = true
    try {
      const res = await getNodeTree()
      if (res.code === 200) {
        treeData.value = Array.isArray(res.data) ? res.data : []
      }
    } catch (error) {
      console.error('获取节点树失败:', error)
      treeData.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchStats() {
    try {
      const res = await getNodeStats()
      if (res.code === 200 && res.data) {
        const raw = res.data as any
        const data = raw.overview || raw
        stats.value = data || { total: 0, online: 0, warning: 0, error: 0, offline: 0 }
      }
    } catch (error) {
      console.error('获取节点统计失败:', error)
    }
  }

  async function fetchNodesPaged(page: number, size: number, filters?: Partial<PageQuery>) {
    loading.value = true
    try {
      const params: PageQuery = {
        page,
        pageSize: size,
        ...filters
      }
      const res = await getNodeList(params)
      if (res.code === 200 && res.data) {
        const list = res.data.list || []
        nodes.value = list
        currentPage.value = page
        pageSize.value = size
        currentFilters.value = filters || {}
        hasMore.value = list.length >= size
      }
    } catch (error) {
      console.error('分页获取节点列表失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function loadMore() {
    if (!hasMore.value || loading.value) return
    loading.value = true
    try {
      const nextPage = currentPage.value + 1
      const params: PageQuery = {
        page: nextPage,
        pageSize: pageSize.value,
        ...currentFilters.value
      }
      const res = await getNodeList(params)
      if (res.code === 200 && res.data) {
        const list = res.data.list || []
        nodes.value = [...nodes.value, ...list]
        currentPage.value = nextPage
        hasMore.value = list.length >= pageSize.value
      }
    } catch (error) {
      console.error('加载更多节点失败:', error)
    } finally {
      loading.value = false
    }
  }

  function selectNode(node: NodeInfo | null) {
    selectedNode.value = node
  }

  function getNodeStatusColor(status: NodeStatus): string {
    const colors: Record<NodeStatus, string> = {
      online: 'var(--el-color-success)',
      warning: 'var(--el-color-warning)',
      error: 'var(--el-color-danger)',
      offline: 'var(--el-color-info)'
    }
    return colors[status] || colors.offline
  }

  function getNodeStatusText(status: NodeStatus): string {
    const texts: Record<NodeStatus, string> = {
      online: '在线',
      warning: '告警',
      error: '异常',
      offline: '离线'
    }
    return texts[status] || '未知'
  }

  return {
    nodes,
    treeData,
    selectedNode,
    loading,
    hasMore,
    currentPage,
    pageSize,
    stats,
    onlineRate,
    fetchNodes,
    fetchNodesPaged,
    loadMore,
    fetchTree,
    fetchStats,
    selectNode,
    getNodeStatusColor,
    getNodeStatusText
  }
})

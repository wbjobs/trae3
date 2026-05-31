import { ref, reactive, computed, onUnmounted } from 'vue'
import DataLoader from '../core/DataLoader'

export function useData() {
  const dataLoader = ref(null)

  const loadingState = reactive({
    isLoading: false,
    isLoaded: false,
    error: null,
    progress: {
      loaded: 0,
      total: 0,
      type: null
    }
  })

  const data = reactive({
    tunnels: [],
    pipes: [],
    fans: [],
    annotations: [],
    tunnelThreeObjects: [],
    pipeThreeObjects: [],
    fanThreeObjects: [],
    annotationThreeObjects: []
  })

  const cache = reactive({
    tunnelDetail: new Map(),
    lastUpdate: null
  })

  const stats = computed(() => ({
    tunnelCount: data.tunnels.length,
    pipeCount: data.pipes.length,
    fanCount: data.fans.length,
    annotationCount: data.annotations.length,
    totalObjectCount:
      data.tunnelThreeObjects.length +
      data.pipeThreeObjects.length +
      data.fanThreeObjects.length +
      data.annotationThreeObjects.length
  }))

  const initDataLoader = (options = {}) => {
    dataLoader.value = new DataLoader({
      onProgress: (progress) => {
        loadingState.progress.loaded = progress.loaded
        loadingState.progress.total = progress.total
        loadingState.progress.type = progress.type
      },
      ...options
    })
    return dataLoader.value
  }

  const loadAllData = async (types = ['tunnels', 'pipes', 'fans', 'annotations']) => {
    if (!dataLoader.value) {
      initDataLoader()
    }

    loadingState.isLoading = true
    loadingState.error = null
    loadingState.progress.loaded = 0
    loadingState.progress.total = types.length

    try {
      const results = await dataLoader.value.loadAll(types)

      if (results.tunnels) {
        data.tunnels = results.tunnels.raw || []
        data.tunnelThreeObjects = results.tunnels.three || []
      }
      if (results.pipes) {
        data.pipes = results.pipes.raw || []
        data.pipeThreeObjects = results.pipes.three || []
      }
      if (results.fans) {
        data.fans = results.fans.raw || []
        data.fanThreeObjects = results.fans.three || []
      }
      if (results.annotations) {
        data.annotations = results.annotations.raw || []
        data.annotationThreeObjects = results.annotations.three || []
      }

      loadingState.isLoaded = true
      cache.lastUpdate = new Date()

      return {
        tunnels: data.tunnels,
        pipes: data.pipes,
        fans: data.fans,
        annotations: data.annotations,
        threeObjects: {
          tunnels: data.tunnelThreeObjects,
          pipes: data.pipeThreeObjects,
          fans: data.fanThreeObjects,
          annotations: data.annotationThreeObjects
        }
      }
    } catch (error) {
      loadingState.error = error.message || '加载数据失败'
      console.error('Failed to load data:', error)
      throw error
    } finally {
      loadingState.isLoading = false
    }
  }

  const loadTunnels = async (forceRefresh = false) => {
    if (!dataLoader.value) initDataLoader()
    loadingState.isLoading = true
    loadingState.error = null

    try {
      const result = await dataLoader.value.loadType('tunnels', forceRefresh)
      data.tunnels = result.raw || []
      data.tunnelThreeObjects = result.three || []
      return result
    } catch (error) {
      loadingState.error = error.message || '加载巷道数据失败'
      throw error
    } finally {
      loadingState.isLoading = false
    }
  }

  const loadPipes = async (forceRefresh = false) => {
    if (!dataLoader.value) initDataLoader()
    loadingState.isLoading = true
    loadingState.error = null

    try {
      const result = await dataLoader.value.loadType('pipes', forceRefresh)
      data.pipes = result.raw || []
      data.pipeThreeObjects = result.three || []
      return result
    } catch (error) {
      loadingState.error = error.message || '加载管道数据失败'
      throw error
    } finally {
      loadingState.isLoading = false
    }
  }

  const loadFans = async (forceRefresh = false) => {
    if (!dataLoader.value) initDataLoader()
    loadingState.isLoading = true
    loadingState.error = null

    try {
      const result = await dataLoader.value.loadType('fans', forceRefresh)
      data.fans = result.raw || []
      data.fanThreeObjects = result.three || []
      return result
    } catch (error) {
      loadingState.error = error.message || '加载风机数据失败'
      throw error
    } finally {
      loadingState.isLoading = false
    }
  }

  const loadAnnotations = async (forceRefresh = false) => {
    if (!dataLoader.value) initDataLoader()
    loadingState.isLoading = true
    loadingState.error = null

    try {
      const result = await dataLoader.value.loadType('annotations', forceRefresh)
      data.annotations = result.raw || []
      data.annotationThreeObjects = result.three || []
      return result
    } catch (error) {
      loadingState.error = error.message || '加载标注数据失败'
      throw error
    } finally {
      loadingState.isLoading = false
    }
  }

  const loadTunnelDetail = async (tunnelId, forceRefresh = false) => {
    if (!dataLoader.value) initDataLoader()

    if (!forceRefresh && cache.tunnelDetail.has(tunnelId)) {
      return cache.tunnelDetail.get(tunnelId)
    }

    try {
      const result = await dataLoader.value.loadTunnelDetail(tunnelId, forceRefresh)
      cache.tunnelDetail.set(tunnelId, result)
      return result
    } catch (error) {
      console.error('Failed to load tunnel detail:', error)
      throw error
    }
  }

  const loadPaginated = async (type, page = 1, pageSize = 100) => {
    if (!dataLoader.value) initDataLoader()
    return await dataLoader.value.loadPaginated(type, page, pageSize)
  }

  const loadIncremental = async (type, lastId = null, limit = 50) => {
    if (!dataLoader.value) initDataLoader()
    return await dataLoader.value.loadIncremental(type, lastId, limit)
  }

  const refreshData = async (types = ['tunnels', 'pipes', 'fans', 'annotations']) => {
    if (!dataLoader.value) initDataLoader()
    dataLoader.value.clearCache()
    return await loadAllData(types)
  }

  const clearCache = (prefix = null) => {
    if (dataLoader.value) {
      dataLoader.value.clearCache(prefix)
    }
    if (!prefix) {
      cache.tunnelDetail.clear()
    }
  }

  const getThreeObjectsByType = (type) => {
    switch (type) {
      case 'tunnels':
        return data.tunnelThreeObjects
      case 'pipes':
        return data.pipeThreeObjects
      case 'fans':
        return data.fanThreeObjects
      case 'annotations':
        return data.annotationThreeObjects
      default:
        return []
    }
  }

  const getAllThreeObjects = () => {
    return [
      ...data.tunnelThreeObjects,
      ...data.pipeThreeObjects,
      ...data.fanThreeObjects,
      ...data.annotationThreeObjects
    ]
  }

  const getRawDataByType = (type) => {
    switch (type) {
      case 'tunnels':
        return data.tunnels
      case 'pipes':
        return data.pipes
      case 'fans':
        return data.fans
      case 'annotations':
        return data.annotations
      default:
        return []
    }
  }

  const findObjectById = (id) => {
    const allObjects = getAllThreeObjects()
    return allObjects.find((obj) => obj.userData?.data?.id === id)
  }

  const findRawDataById = (id) => {
    const allTypes = ['tunnels', 'pipes', 'fans', 'annotations']
    for (const type of allTypes) {
      const list = getRawDataByType(type)
      const found = list.find((item) => item.id === id)
      if (found) return { type, data: found }
    }
    return null
  }

  const filterData = (type, filters) => {
    const rawData = getRawDataByType(type)
    return rawData.filter((item) => {
      for (const [key, value] of Object.entries(filters)) {
        if (item[key] !== value) return false
      }
      return true
    })
  }

  const searchData = (query) => {
    const q = query.toLowerCase()
    const results = []

    const searchInType = (type, items) => {
      items.forEach((item) => {
        const name = item.name?.toLowerCase() || ''
        const description = item.description?.toLowerCase() || ''
        const typeName = item.type?.toLowerCase() || ''
        const status = item.status?.toLowerCase() || ''

        if (
          name.includes(q) ||
          description.includes(q) ||
          typeName.includes(q) ||
          status.includes(q)
        ) {
          results.push({ type, data: item })
        }
      })
    }

    searchInType('tunnels', data.tunnels)
    searchInType('pipes', data.pipes)
    searchInType('fans', data.fans)
    searchInType('annotations', data.annotations)

    return results
  }

  const calculateBounds = (objects = null) => {
    if (!dataLoader.value) return null
    const targetObjects = objects || getAllThreeObjects()
    return dataLoader.value.calculateBounds(targetObjects)
  }

  const simplifyPath = (points, tolerance = 0.5) => {
    if (!dataLoader.value) return points
    return dataLoader.value.simplifyPath(points, tolerance)
  }

  const dispose = () => {
    if (dataLoader.value) {
      dataLoader.value.dispose()
      dataLoader.value = null
    }

    data.tunnels = []
    data.pipes = []
    data.fans = []
    data.annotations = []
    data.tunnelThreeObjects = []
    data.pipeThreeObjects = []
    data.fanThreeObjects = []
    data.annotationThreeObjects = []

    cache.tunnelDetail.clear()
    cache.lastUpdate = null

    loadingState.isLoading = false
    loadingState.isLoaded = false
    loadingState.error = null
    loadingState.progress = { loaded: 0, total: 0, type: null }
  }

  onUnmounted(() => {
    dispose()
  })

  return {
    data,
    loadingState,
    stats,
    cache,

    initDataLoader,
    loadAllData,
    loadTunnels,
    loadPipes,
    loadFans,
    loadAnnotations,
    loadTunnelDetail,
    loadPaginated,
    loadIncremental,
    refreshData,

    clearCache,

    getThreeObjectsByType,
    getAllThreeObjects,
    getRawDataByType,
    findObjectById,
    findRawDataById,
    filterData,
    searchData,

    calculateBounds,
    simplifyPath,

    dispose
  }
}

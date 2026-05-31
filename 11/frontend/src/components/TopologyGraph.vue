<template>
  <div class="topology-container">
    <div ref="chartRef" class="topology-chart"></div>
    <div v-if="selectedDevice" class="device-info-panel">
      <el-card shadow="hover">
        <template #header>
          <div class="card-header">
            <span>设备详情</span>
            <el-button type="text" @click="selectedDevice = null">关闭</el-button>
          </div>
        </template>
        <el-descriptions :column="1" size="small" border>
          <el-descriptions-item label="设备ID">{{ selectedDevice.device_id }}</el-descriptions-item>
          <el-descriptions-item label="设备名称">{{ selectedDevice.name }}</el-descriptions-item>
          <el-descriptions-item label="设备类型">
            <el-tag :type="getDeviceTypeColor(selectedDevice.device_type)">
              {{ getDeviceTypeName(selectedDevice.device_type) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="selectedDevice.status === 'online' ? 'success' : 'danger'">
              {{ selectedDevice.status === 'online' ? '在线' : '离线' }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="位置">{{ selectedDevice.location }}</el-descriptions-item>
          <el-descriptions-item label="父节点">{{ selectedDevice.parent_device_id || '-' }}</el-descriptions-item>
        </el-descriptions>
        
        <div v-if="selectedDevice.signal" class="signal-info">
          <h4>实时信号数据</h4>
          <el-descriptions :column="2" size="small" border>
            <el-descriptions-item label="信号强度">
              <span :class="getSignalClass(selectedDevice.signal.signal_strength)">
                {{ selectedDevice.signal.signal_strength || '-' }} dBm
              </span>
            </el-descriptions-item>
            <el-descriptions-item label="信噪比">{{ selectedDevice.signal.snr || '-' }} dB</el-descriptions-item>
            <el-descriptions-item label="CPU使用率">{{ selectedDevice.signal.cpu_usage || '-' }}%</el-descriptions-item>
            <el-descriptions-item label="内存使用率">{{ selectedDevice.signal.memory_usage || '-' }}%</el-descriptions-item>
            <el-descriptions-item label="温度">{{ selectedDevice.signal.temperature || '-' }}°C</el-descriptions-item>
            <el-descriptions-item label="连接客户端">{{ selectedDevice.signal.connected_clients || 0 }}</el-descriptions-item>
          </el-descriptions>
        </div>
      </el-card>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { deviceApi } from '../api'
import wsClient from '../utils/websocket'

const props = defineProps({
  devices: {
    type: Array,
    default: () => []
  },
  links: {
    type: Array,
    default: () => []
  },
  signalData: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['device-select'])

const chartRef = ref(null)
const selectedDevice = ref(null)
const nodePositions = ref(new Map())
const nodeCache = ref(new Map())
const linkCache = ref(new Map())
let chartInstance = null
let isDragging = false
let updateTimeout = null
let partialUpdateCount = ref(0)
let fullRefreshCount = ref(0)

const getDeviceTypeName = (type) => {
  const names = {
    ap: '核心AP',
    repeater: '中继节点',
    endpoint: '终端设备'
  }
  return names[type] || type
}

const getDeviceTypeColor = (type) => {
  const colors = {
    ap: 'primary',
    repeater: 'warning',
    endpoint: 'info'
  }
  return colors[type] || 'info'
}

const getDeviceColor = (device) => {
  if (device.status !== 'online') {
    return '#909399'
  }
  const colors = {
    ap: '#409EFF',
    repeater: '#E6A23C',
    endpoint: '#67C23A'
  }
  return colors[device.device_type] || '#909399'
}

const getSignalClass = (strength) => {
  if (!strength) return 'signal-unknown'
  if (strength > -50) return 'signal-excellent'
  if (strength > -65) return 'signal-good'
  if (strength > -75) return 'signal-fair'
  return 'signal-poor'
}

const initChart = () => {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  
  chartInstance.on('click', (params) => {
    if (params.dataType === 'node') {
      const device = props.devices.find(d => d.device_id === params.data.id)
      if (device) {
        selectedDevice.value = { ...device }
        emit('device-select', selectedDevice.value)
        fetchDeviceSignal(selectedDevice.value.device_id)
      }
    }
  })

  chartInstance.on('dragStart', () => {
    isDragging = true
  })

  chartInstance.on('dragEnd', () => {
    isDragging = false
    saveNodePositions()
  })

  chartInstance.on('finished', () => {
    if (!isDragging && nodePositions.value.size === 0) {
      saveNodePositions()
    }
  })

  window.addEventListener('resize', handleResize)
}

const saveNodePositions = () => {
  if (!chartInstance) return
  
  const option = chartInstance.getOption()
  if (option && option.series && option.series[0] && option.series[0].data) {
    option.series[0].data.forEach(node => {
      if (node.x !== undefined && node.y !== undefined) {
        nodePositions.value.set(node.id, { x: node.x, y: node.y })
      }
    })
  }
}

const handleResize = () => {
  if (chartInstance) {
    chartInstance.resize()
  }
}

const fetchDeviceSignal = async (deviceId) => {
  try {
    const res = await deviceApi.getSignalLatest(deviceId)
    if (res.success && res.data.length > 0) {
      selectedDevice.value = { ...selectedDevice.value, signal: res.data[0] }
    }
  } catch (e) {
    console.error('获取设备信号数据失败', e)
  }
}

const buildNodes = () => {
  return props.devices.map(device => {
    const node = {
      id: device.device_id,
      name: device.name,
      symbolSize: device.device_type === 'ap' ? 50 : device.device_type === 'repeater' ? 40 : 30,
      itemStyle: {
        color: getDeviceColor(device)
      },
      label: {
        show: true,
        fontSize: 12
      },
      ...device
    }

    const savedPos = nodePositions.value.get(device.device_id)
    if (savedPos) {
      node.x = savedPos.x
      node.y = savedPos.y
      node.fixed = true
    }

    return node
  })
}

const buildEdges = () => {
  return props.links.map(link => ({
    source: link.source_device_id,
    target: link.target_device_id,
    lineStyle: {
      color: link.quality > 80 ? '#67C23A' : link.quality > 60 ? '#E6A23C' : '#F56C6C',
      width: 2,
      type: link.link_type === 'wireless' ? 'dashed' : 'solid'
    },
    label: {
      show: true,
      formatter: `${link.quality}%`,
      fontSize: 10
    }
  }))
}

const updateChart = (forceRebuild = false) => {
  if (!chartInstance) return

  const nodes = buildNodes()
  const edges = buildEdges()

  const option = {
    tooltip: {
      formatter: (params) => {
        if (params.dataType === 'node') {
          const data = params.data
          return `
            <div style="padding: 8px;">
              <div style="font-weight: bold; margin-bottom: 4px;">${data.name}</div>
              <div>类型: ${getDeviceTypeName(data.device_type)}</div>
              <div>状态: ${data.status === 'online' ? '在线' : '离线'}</div>
              <div>位置: ${data.location || '-'}</div>
            </div>
          `
        }
        return ''
      }
    },
    series: [{
      type: 'graph',
      layout: nodePositions.value.size > 0 ? 'none' : 'force',
      roam: true,
      draggable: true,
      focusNodeAdjacency: true,
      force: {
        repulsion: 300,
        edgeLength: 120,
        gravity: 0.1,
        friction: 0.4
      },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: [0, 8],
      data: nodes,
      links: edges,
      lineStyle: {
        curveness: 0.1
      },
      animationDuration: 500,
      animationEasingUpdate: 'quinticInOut'
    }]
  }

  chartInstance.setOption(option, forceRebuild)
}

const updateNodeCache = () => {
  props.devices.forEach(device => {
    nodeCache.value.set(device.device_id, { ...device })
  })
  props.links.forEach(link => {
    const key = `${link.source_device_id}-${link.target_device_id}`
    linkCache.value.set(key, { ...link })
  })
}

const updateNodePartial = (nodeId, changes) => {
  if (isDragging) return
  
  const option = chartInstance.getOption()
  if (!option || !option.series || !option.series[0]) return
  
  const nodes = option.series[0].data
  const nodeIndex = nodes.findIndex(n => n.id === nodeId || n.device_id === nodeId)
  
  if (nodeIndex === -1) return
  
  const updatedNode = { ...nodes[nodeIndex] }
  
  Object.keys(changes).forEach(key => {
    if (changes[key] && changes[key].new !== undefined) {
      updatedNode[key] = changes[key].new
    } else {
      updatedNode[key] = changes[key]
    }
  })
  
  if (changes.status || changes.signal_strength) {
    updatedNode.itemStyle = {
      ...updatedNode.itemStyle,
      color: getDeviceColor(updatedNode)
    }
  }
  
  nodes[nodeIndex] = updatedNode
  
  chartInstance.setOption({
    series: [{
      data: nodes
    }]
  }, {
    replaceMerge: ['series'],
    lazyUpdate: true
  })
  
  partialUpdateCount.value++
  
  if (nodeCache.value.has(nodeId)) {
    const cached = nodeCache.value.get(nodeId)
    nodeCache.value.set(nodeId, { ...cached, ...updatedNode })
  }
}

const updateLinkPartial = (sourceId, targetId, changes) => {
  if (isDragging) return
  
  const option = chartInstance.getOption()
  if (!option || !option.series || !option.series[0]) return
  
  const links = option.series[0].links
  const linkIndex = links.findIndex(l => 
    (l.source === sourceId && l.target === targetId) ||
    (l.source === targetId && l.target === sourceId)
  )
  
  if (linkIndex === -1) return
  
  const updatedLink = { ...links[linkIndex] }
  
  Object.keys(changes).forEach(key => {
    if (changes[key] && changes[key].new !== undefined) {
      updatedLink[key] = changes[key].new
    } else {
      updatedLink[key] = changes[key]
    }
  })
  
  if (changes.quality) {
    updatedLink.lineStyle = {
      ...updatedLink.lineStyle,
      color: changes.quality.new > 80 ? '#67C23A' : changes.quality.new > 60 ? '#E6A23C' : '#F56C6C'
    }
  }
  
  links[linkIndex] = updatedLink
  
  chartInstance.setOption({
    series: [{
      links: links
    }]
  }, {
    replaceMerge: ['series'],
    lazyUpdate: true
  })
  
  partialUpdateCount.value++
}

const handlePartialUpdate = (update) => {
  if (!chartInstance) return
  
  if (update.type === 'node_update') {
    updateNodePartial(update.id, update.changes)
    emit('node-updated', { id: update.id, changes: update.changes })
  } else if (update.type === 'link_update') {
    updateLinkPartial(update.source, update.target, update.changes)
    emit('link-updated', { source: update.source, target: update.target, changes: update.changes })
  }
}

const handleBatchUpdate = (batchUpdate) => {
  if (!chartInstance || isDragging) return
  
  if (batchUpdate.updates && batchUpdate.updates.length > 0) {
    const shouldUseFull = !shouldUsePartialUpdate(
      batchUpdate.updates.length,
      props.devices.length,
      0.3
    )
    
    if (shouldUseFull) {
      fullRefreshCount.value++
      emit('full-refresh-needed', { reason: 'too_many_changes', count: batchUpdate.updates.length })
      return
    }
    
    batchUpdate.updates.forEach(update => {
      handlePartialUpdate(update)
    })
    
    emit('batch-updated', { count: batchUpdate.updates.length })
  }
}

const handleFullRefresh = (refresh) => {
  fullRefreshCount.value++
  emit('full-refresh', { reason: refresh.reason })
  updateChart(true)
}

const shouldUsePartialUpdate = (changeCount, totalCount, threshold = 0.3) => {
  if (totalCount === 0) return false
  return (changeCount / totalCount) < threshold
}

const debouncedUpdate = () => {
  if (isDragging) return
  
  if (updateTimeout) {
    clearTimeout(updateTimeout)
  }
  
  updateTimeout = setTimeout(() => {
    nextTick(() => {
      updateNodeCache()
      updateChart(false)
    })
  }, 300)
}

const getUpdateStats = () => {
  return {
    partialUpdates: partialUpdateCount.value,
    fullRefreshes: fullRefreshCount.value,
    cachedNodes: nodeCache.value.size,
    cachedLinks: linkCache.value.size
  }
}

defineExpose({
  updateNodePartial,
  updateLinkPartial,
  handlePartialUpdate,
  handleBatchUpdate,
  handleFullRefresh,
  getUpdateStats
})

watch(() => [props.devices, props.links], () => {
  debouncedUpdate()
}, { deep: true })

onMounted(() => {
  initChart()
  nextTick(() => {
    updateNodeCache()
    updateChart(true)
  })
  
  wsClient.connect()
  wsClient.on('partial_update', handlePartialUpdate)
  wsClient.on('batch_update', handleBatchUpdate)
  wsClient.on('full_refresh', handleFullRefresh)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  wsClient.off('partial_update', handlePartialUpdate)
  wsClient.off('batch_update', handleBatchUpdate)
  wsClient.off('full_refresh', handleFullRefresh)
  if (updateTimeout) {
    clearTimeout(updateTimeout)
  }
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
})
</script>

<style scoped>
.topology-container {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 500px;
}

.topology-chart {
  width: 100%;
  height: 100%;
  background: #fafafa;
  border-radius: 8px;
}

.device-info-panel {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 350px;
  z-index: 100;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.signal-info {
  margin-top: 16px;
}

.signal-info h4 {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: #303133;
}

.signal-excellent {
  color: #67C23A;
  font-weight: bold;
}

.signal-good {
  color: #409EFF;
}

.signal-fair {
  color: #E6A23C;
}

.signal-poor {
  color: #F56C6C;
  font-weight: bold;
}

.signal-unknown {
  color: #909399;
}
</style>

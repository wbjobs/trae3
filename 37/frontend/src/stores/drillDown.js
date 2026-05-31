import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useDrillDownStore = defineStore('drillDown', () => {
  const timeRange = ref({
    startTime: null,
    endTime: null,
    granularity: '1min'
  })

  const selectedDevice = ref(null)
  const selectedAnomaly = ref(null)
  const drillHistory = ref([])
  const linkedCharts = ref(new Map())
  const activeDrillLevel = ref(0)
  const drillLevels = [
    { name: '概览', granularity: '1hour', timeSpan: '7d' },
    { name: '汇总', granularity: '15min', timeSpan: '1d' },
    { name: '详情', granularity: '1min', timeSpan: '1h' },
    { name: '原始', granularity: '1s', timeSpan: '5min' }
  ]

  const currentLevel = computed(() => drillLevels.value[activeDrillLevel.value] || drillLevels.value[0])
  const canDrillDown = computed(() => activeDrillLevel.value < drillLevels.value.length - 1)
  const canDrillUp = computed(() => activeDrillLevel.value > 0)
  const historyLength = computed(() => drillHistory.value.length)

  function setTimeRange(startTime, endTime, granularity) {
    timeRange.value = {
      startTime: startTime || timeRange.value.startTime,
      endTime: endTime || timeRange.value.endTime,
      granularity: granularity || timeRange.value.granularity
    }
    broadcastToLinkedCharts('timeRangeChanged', timeRange.value)
  }

  function setSelectedDevice(device) {
    selectedDevice.value = device
    broadcastToLinkedCharts('deviceChanged', device)
  }

  function setSelectedAnomaly(anomaly) {
    selectedAnomaly.value = anomaly
    if (anomaly) {
      drillHistory.value.push({
        type: 'anomaly',
        data: anomaly,
        timestamp: Date.now(),
        level: activeDrillLevel.value
      })
    }
    broadcastToLinkedCharts('anomalySelected', anomaly)
  }

  function drillDown() {
    if (!canDrillDown.value) return
    saveToHistory('drillDown')
    activeDrillLevel.value++
    applyCurrentLevelSettings()
    broadcastToLinkedCharts('drillLevelChanged', currentLevel.value)
  }

  function drillUp() {
    if (!canDrillUp.value) return
    saveToHistory('drillUp')
    activeDrillLevel.value--
    applyCurrentLevelSettings()
    broadcastToLinkedCharts('drillLevelChanged', currentLevel.value)
  }

  function goToLevel(level) {
    if (level < 0 || level >= drillLevels.value.length) return
    if (level === activeDrillLevel.value) return

    saveToHistory(`goToLevel_${level}`)
    activeDrillLevel.value = level
    applyCurrentLevelSettings()
    broadcastToLinkedCharts('drillLevelChanged', currentLevel.value)
  }

  function applyCurrentLevelSettings() {
    const level = currentLevel.value
    if (level.granularity) {
      timeRange.value.granularity = level.granularity
    }
  }

  function saveToHistory(action) {
    drillHistory.value.push({
      type: action,
      previousLevel: activeDrillLevel.value,
      previousTimeRange: { ...timeRange.value },
      previousDevice: selectedDevice.value,
      timestamp: Date.now()
    })
  }

  function goBack() {
    if (drillHistory.value.length === 0) return null
    const lastEntry = drillHistory.value.pop()
    return lastEntry
  }

  function clearHistory() {
    drillHistory.value = []
  }

  function registerChart(chartId, handlers) {
    linkedCharts.value.set(chartId, handlers)
  }

  function unregisterChart(chartId) {
    linkedCharts.value.delete(chartId)
  }

  function broadcastToLinkedCharts(event, data) {
    for (const [chartId, handlers] of linkedCharts.value.entries()) {
      if (handlers[event] && typeof handlers[event] === 'function') {
        try {
          handlers[event](data, chartId)
        } catch (e) {
          console.error(`Error broadcasting ${event} to ${chartId}:`, e)
        }
      }
    }
  }

  function highlightAcrossCharts(data) {
    broadcastToLinkedCharts('highlight', data)
  }

  function zoomToRange(startTime, endTime) {
    setTimeRange(startTime, endTime)
    broadcastToLinkedCharts('zoomToRange', { startTime, endTime })
  }

  function reset() {
    timeRange.value = {
      startTime: null,
      endTime: null,
      granularity: '1min'
    }
    selectedDevice.value = null
    selectedAnomaly.value = null
    drillHistory.value = []
    activeDrillLevel.value = 0
    broadcastToLinkedCharts('reset', null)
  }

  return {
    timeRange,
    selectedDevice,
    selectedAnomaly,
    drillHistory,
    linkedCharts,
    activeDrillLevel,
    drillLevels,
    currentLevel,
    canDrillDown,
    canDrillUp,
    historyLength,
    setTimeRange,
    setSelectedDevice,
    setSelectedAnomaly,
    drillDown,
    drillUp,
    goToLevel,
    goBack,
    clearHistory,
    registerChart,
    unregisterChart,
    broadcastToLinkedCharts,
    highlightAcrossCharts,
    zoomToRange,
    reset
  }
})

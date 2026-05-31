<template>
  <div class="chart-container">
    <div class="chart-title">
      <span>{{ title }}</span>
      <div class="chart-controls">
        <el-radio-group v-model="chartType" size="small">
          <el-radio-button value="line">折线图</el-radio-button>
          <el-radio-button value="bar">柱状图</el-radio-button>
        </el-radio-group>
        <el-switch
          v-model="enableSampling"
          size="small"
          active-text="智能采样"
          inactive-text="原始数据"
          style="margin-left: 16px"
        />
        <span v-if="samplingInfo" class="sampling-info">
          {{ samplingInfo.originalCount.toLocaleString() }} → {{ samplingInfo.sampledCount.toLocaleString() }} 点
        </span>
      </div>
    </div>
    <div ref="chartRef" class="chart-wrapper"></div>
    <div v-if="annotations.length > 0" class="annotation-legend">
      <span class="legend-title">标注:</span>
      <span
        v-for="(ann, idx) in annotations"
        :key="idx"
        class="legend-item"
        :style="{ color: ann.color }"
        @click="focusAnnotation(ann)"
      >
        ● {{ ann.label }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, defineProps, defineEmits, computed } from 'vue'
import * as echarts from 'echarts'
import { DataSampler } from '@/utils/dataSampler'

const props = defineProps({
  title: {
    type: String,
    default: '振动数据图表'
  },
  xData: {
    type: Array,
    default: () => []
  },
  yData: {
    type: Object,
    default: () => ({})
  },
  type: {
    type: String,
    default: 'line'
  },
  annotations: {
    type: Array,
    default: () => []
  },
  maxPoints: {
    type: Number,
    default: 2000
  },
  enableSamplingDefault: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['chartClick', 'annotationClick'])

const chartRef = ref(null)
let chartInstance = null
const chartType = ref(props.type)
const enableSampling = ref(props.enableSamplingDefault)
const samplingInfo = ref(null)

const colors = ['#409eff', '#67c23a', '#e6a23c', '#f56c6c', '#909399']
const annotationColors = ['#f56c6c', '#e6a23c', '#909399', '#8e44ad', '#16a085']

const processedData = computed(() => {
  if (!props.xData || props.xData.length === 0) {
    samplingInfo.value = null
    return { xData: [], yData: props.yData, originalIndices: null }
  }

  if (enableSampling.value && props.xData.length > props.maxPoints) {
    const result = DataSampler.downsampleMultiAxis(props.yData, props.xData, props.maxPoints)
    samplingInfo.value = {
      originalCount: result.originalCount,
      sampledCount: result.sampledCount
    }
    return {
      xData: result.xData,
      yData: result.yData,
      originalIndices: result.indices
    }
  }

  samplingInfo.value = props.xData.length > props.maxPoints
    ? { originalCount: props.xData.length, sampledCount: props.xData.length }
    : null

  return {
    xData: props.xData,
    yData: props.yData,
    originalIndices: null
  }
})

const findNearestDataIndex = (xValue) => {
  const xArr = processedData.value.xData
  if (!xArr || xArr.length === 0) return -1

  let left = 0
  let right = xArr.length - 1

  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    if (xArr[mid] === xValue) return mid
    if (xArr[mid] < xValue) left = mid + 1
    else right = mid - 1
  }

  if (right < 0) return 0
  if (left >= xArr.length) return xArr.length - 1

  return Math.abs(xArr[left] - xValue) < Math.abs(xArr[right] - xValue) ? left : right
}

const getChartOption = () => {
  const { xData, yData } = processedData.value
  const axes = Object.keys(yData)

  const series = axes.map((key, index) => ({
    name: key,
    type: chartType.value,
    smooth: chartType.value === 'line',
    showSymbol: false,
    large: xData.length > 1000,
    largeThreshold: 1000,
    sampling: 'lttb',
    data: yData[key],
    lineStyle: {
      width: xData.length > 5000 ? 1 : 2
    },
    itemStyle: {
      color: colors[index % colors.length]
    },
    emphasis: {
      focus: 'series'
    },
    z: axes.length - index
  }))

  const markPoints = []
  const markLines = []

  props.annotations.forEach((ann, annIdx) => {
    const color = ann.color || annotationColors[annIdx % annotationColors.length]

    if (ann.type === 'point') {
      const dataIndex = findNearestDataIndex(ann.x)
      if (dataIndex >= 0) {
        const yAxis = ann.axis ? axes.indexOf(ann.axis) : 0
        markPoints.push({
          name: ann.label,
          coord: [ann.x, ann.y],
          value: ann.label,
          itemStyle: { color },
          label: {
            show: true,
            formatter: ann.label,
            position: 'top',
            color,
            fontSize: 11,
            backgroundColor: 'rgba(255,255,255,0.9)',
            padding: [4, 8],
            borderRadius: 4
          },
          symbolSize: 10,
          yAxisIndex: yAxis >= 0 ? yAxis : 0
        })
      }
    } else if (ann.type === 'line') {
      markLines.push({
        silent: false,
        symbol: 'none',
        label: {
          formatter: ann.label,
          position: 'end',
          color,
          fontSize: 11
        },
        lineStyle: {
          color,
          width: 2,
          type: ann.style || 'dashed'
        },
        data: [
          { xAxis: ann.x1, yAxis: ann.y1 },
          { xAxis: ann.x2, yAxis: ann.y2 }
        ]
      })
    } else if (ann.type === 'threshold') {
      markLines.push({
        silent: false,
        symbol: 'none',
        label: {
          formatter: `${ann.label}: ${ann.value}`,
          position: 'insideEndTop',
          color,
          fontSize: 11
        },
        lineStyle: {
          color,
          width: 2,
          type: 'dashed'
        },
        data: [
          { yAxis: ann.value }
        ]
      })
    } else if (ann.type === 'range') {
      markLines.push({
        silent: false,
        symbol: 'none',
        label: {
          formatter: ann.label,
          position: 'insideTop',
          color,
          fontSize: 11
        },
        lineStyle: {
          color,
          width: 0
        },
        data: [
          [
            { xAxis: ann.x1, yAxis: null, itemStyle: { color: color + '40' } },
            { xAxis: ann.x2, yAxis: null }
          ]
        ],
        areaStyle: {
          color: color + '20'
        }
      })
    }
  })

  if (markPoints.length > 0 && series.length > 0) {
    series[0].markPoint = {
      data: markPoints,
      animation: false
    }
  }

  if (markLines.length > 0 && series.length > 0) {
    series[0].markLine = {
      data: markLines,
      animation: false,
      triggerLineEvent: true
    }
  }

  return {
    animation: xData.length < 500,
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        animation: false,
        label: {
          backgroundColor: '#6a7985',
          precision: 4
        }
      },
      backgroundColor: 'rgba(255, 255, 255, 0.95)',
      borderColor: '#e5e7eb',
      borderWidth: 1,
      textStyle: {
        color: '#333'
      },
      formatter: (params) => {
        if (!params || params.length === 0) return ''
        let html = `<div style="font-weight:600;margin-bottom:8px">${params[0].axisValue}</div>`
        params.forEach(p => {
          if (p.seriesType === 'markLine') {
            html += `<div style="color:${p.color}">${p.seriesName}</div>`
          } else {
            html += `<div style="color:${p.color}">${p.seriesName}: ${Number(p.value).toFixed(6)}</div>`
          }
        })
        return html
      }
    },
    legend: {
      data: axes,
      top: 0,
      selectedMode: true
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
        zoomOnMouseWheel: 'ctrl',
        moveOnMouseMove: true,
        preventDefaultMouseMove: false
      },
      {
        type: 'slider',
        height: 25,
        bottom: 5,
        start: 0,
        end: 100,
        brushSelect: false
      }
    ],
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: xData,
      axisLabel: {
        rotate: 45,
        fontSize: 10,
        interval: Math.floor(xData.length / 15)
      },
      axisTick: {
        alignWithLabel: true
      }
    },
    yAxis: {
      type: 'value',
      splitLine: {
        lineStyle: {
          type: 'dashed'
        }
      },
      axisLabel: {
        precision: 4
      }
    },
    series
  }
}

const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value, null, {
    renderer: 'canvas',
    useDirtyRect: true
  })

  chartInstance.setOption(getChartOption())

  chartInstance.on('click', (params) => {
    if (params.componentType === 'markLine' || params.componentType === 'markPoint') {
      const annotation = props.annotations.find(a => a.label === params.name || a.label === params.seriesName)
      if (annotation) {
        emit('annotationClick', annotation)
      }
    } else {
      const dataIndex = processedData.value.originalIndices
        ? processedData.value.originalIndices[params.dataIndex]
        : params.dataIndex
      emit('chartClick', { ...params, dataIndex })
    }
  })

  chartInstance.on('datazoom', () => {
    const option = chartInstance.getOption()
    if (option && option.dataZoom) {
      const start = option.dataZoom[0].start
      const end = option.dataZoom[0].end
      if (start !== undefined && end !== undefined) {
        emit('dataZoom', { start, end })
      }
    }
  })

  window.addEventListener('resize', handleResize)
}

const handleResize = () => {
  chartInstance?.resize({
    animation: { duration: 0 }
  })
}

const focusAnnotation = (annotation) => {
  if (!chartInstance || !annotation.x) return

  const xData = processedData.value.xData
  const dataIndex = findNearestDataIndex(annotation.x)
  if (dataIndex < 0) return

  const totalPoints = xData.length
  const windowSize = Math.min(100, totalPoints)
  const startPercent = Math.max(0, ((dataIndex - windowSize / 2) / totalPoints) * 100)
  const endPercent = Math.min(100, ((dataIndex + windowSize / 2) / totalPoints) * 100)

  chartInstance.dispatchAction({
    type: 'dataZoom',
    start: startPercent,
    end: endPercent
  })

  chartInstance.dispatchAction({
    type: 'highlight',
    seriesIndex: 0,
    dataIndex
  })

  emit('annotationClick', annotation)
}

watch([processedData, chartType], () => {
  if (chartInstance) {
    chartInstance.setOption(getChartOption(), {
      notMerge: false,
      lazyUpdate: true
    })
  }
}, { deep: true })

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  chartInstance?.dispose()
  window.removeEventListener('resize', handleResize)
})

defineExpose({
  resize: handleResize,
  focusAnnotation,
  getInstance: () => chartInstance
})
</script>

<style scoped>
.chart-container {
  background: white;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.chart-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.chart-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.sampling-info {
  font-size: 12px;
  color: #909399;
  background: #f5f7fa;
  padding: 4px 8px;
  border-radius: 4px;
}

.chart-wrapper {
  width: 100%;
  height: 350px;
}

.annotation-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
  margin-top: 12px;
}

.legend-title {
  font-size: 12px;
  color: #909399;
}

.legend-item {
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.legend-item:hover {
  opacity: 0.7;
}
</style>

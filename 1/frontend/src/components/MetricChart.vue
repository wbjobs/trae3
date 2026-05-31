<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  title?: string
  type?: 'line' | 'bar' | 'pie'
  data?: any
  xAxisData?: string[]
  series?: any[]
  height?: string
  smooth?: boolean
  loading?: boolean
  color?: string
}>()

const chartRef = ref<HTMLDivElement | null>(null)
let chartInstance: echarts.ECharts | null = null

function initChart() {
  if (!chartRef.value) return
  
  chartInstance = echarts.init(chartRef.value)
  updateChart()
}

function updateChart() {
  if (!chartInstance) return

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: props.type === 'pie' ? 'item' : 'axis',
      backgroundColor: 'rgba(26, 35, 50, 0.95)',
      borderColor: '#2A3441',
      textStyle: {
        color: '#E4E7EB'
      }
    },
    legend: {
      show: props.type === 'pie',
      textStyle: {
        color: '#8492A6'
      },
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '10%',
      containLabel: true
    },
    xAxis: props.type !== 'pie' ? {
      type: 'category',
      boundaryGap: props.type === 'bar',
      data: props.xAxisData || [],
      axisLine: {
        lineStyle: {
          color: '#2A3441'
        }
      },
      axisLabel: {
        color: '#8492A6'
      }
    } : undefined,
    yAxis: props.type !== 'pie' ? {
      type: 'value',
      axisLine: {
        show: false
      },
      axisTick: {
        show: false
      },
      splitLine: {
        lineStyle: {
          color: '#2A3441',
          type: 'dashed'
        }
      },
      axisLabel: {
        color: '#8492A6',
        formatter: '{value}%'
      }
    } : undefined,
    series: props.series || (props.type === 'pie' ? [{
      type: 'pie',
      radius: ['40%', '70%'],
      avoidLabelOverlap: false,
      itemStyle: {
        borderRadius: 10,
        borderColor: '#1A2332',
        borderWidth: 2
      },
      label: {
        show: false,
        position: 'center'
      },
      emphasis: {
        label: {
          show: true,
          fontSize: 16,
          fontWeight: 'bold',
          color: '#E4E7EB'
        }
      },
      labelLine: {
        show: false
      },
      data: props.data || []
    }] : [{
      type: props.type || 'line',
      smooth: props.smooth ?? true,
      symbol: 'circle',
      symbolSize: 6,
      lineStyle: {
        width: 2,
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 1,
          y2: 0,
          colorStops: [
            { offset: 0, color: '#00D4FF' },
            { offset: 1, color: '#0099CC' }
          ]
        }
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(0, 212, 255, 0.3)' },
            { offset: 1, color: 'rgba(0, 212, 255, 0)' }
          ]
        }
      },
      itemStyle: {
        color: '#00D4FF',
        borderColor: '#1A2332',
        borderWidth: 2
      },
      data: props.data || []
    }])
  }

  chartInstance.setOption(option)
}

function handleResize() {
  chartInstance?.resize()
}

onMounted(() => {
  initChart()
  window.addEventListener('resize', handleResize)
})

watch(() => [props.data, props.xAxisData, props.series], () => {
  updateChart()
}, { deep: true })

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chartInstance?.dispose()
})

defineExpose({
  refresh: updateChart
})
</script>

<template>
  <div class="metric-chart bg-dark-card rounded-lg border border-dark-border p-4">
    <h3 v-if="title" class="text-sm font-medium mb-4 text-dark-text">{{ title }}</h3>
    <div ref="chartRef" :style="`height: ${height || '300px'}`"></div>
  </div>
</template>

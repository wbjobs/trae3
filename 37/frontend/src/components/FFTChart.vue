<template>
  <div class="chart-container">
    <div class="chart-title">{{ title }}</div>
    <div ref="chartRef" class="chart-wrapper"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, defineProps } from 'vue'
import * as echarts from 'echarts'

const props = defineProps({
  title: {
    type: String,
    default: '频谱分析图'
  },
  frequencies: {
    type: Array,
    default: () => []
  },
  magnitudes: {
    type: Object,
    default: () => ({})
  }
})

const chartRef = ref(null)
let chartInstance = null

const colors = ['#409eff', '#67c23a', '#e6a23c']

const getChartOption = () => {
  const series = Object.keys(props.magnitudes).map((key, index) => ({
    name: key,
    type: 'line',
    smooth: true,
    showSymbol: false,
    areaStyle: {
      opacity: 0.3
    },
    data: props.magnitudes[key],
    itemStyle: {
      color: colors[index % colors.length]
    }
  }))

  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params) => {
        let html = `<div>频率: ${params[0].axisValue} Hz</div>`
        params.forEach(p => {
          html += `<div style="color:${p.color}">${p.seriesName}: ${p.value.toFixed(4)}</div>`
        })
        return html
      }
    },
    legend: {
      data: Object.keys(props.magnitudes),
      top: 0
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '3%',
      top: '15%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      name: '频率 (Hz)',
      nameLocation: 'middle',
      nameGap: 25,
      data: props.frequencies.map(f => f.toFixed(1)),
      axisLabel: {
        interval: Math.floor(props.frequencies.length / 10),
        fontSize: 10
      }
    },
    yAxis: {
      type: 'value',
      name: '幅值',
      splitLine: {
        lineStyle: {
          type: 'dashed'
        }
      }
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100
      }
    ],
    series
  }
}

const initChart = () => {
  if (!chartRef.value) return

  chartInstance = echarts.init(chartRef.value)
  chartInstance.setOption(getChartOption())

  window.addEventListener('resize', handleResize)
}

const handleResize = () => {
  chartInstance?.resize()
}

watch([() => props.frequencies, () => props.magnitudes], () => {
  chartInstance?.setOption(getChartOption())
}, { deep: true })

onMounted(() => {
  initChart()
})

onUnmounted(() => {
  chartInstance?.dispose()
  window.removeEventListener('resize', handleResize)
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
  font-size: 16px;
  font-weight: 600;
  color: #333;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.chart-wrapper {
  width: 100%;
  height: 350px;
}
</style>

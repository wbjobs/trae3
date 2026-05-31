
<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components'

use([
  LineChart,
  CanvasRenderer,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  LegendComponent,
  DataZoomComponent,
])

const props = defineProps<{
  title?: string
  sensorId?: string
  data?: Array<{ time: Date; value: number }>
  color?: string
  unit?: string
}>()

const chartData = computed(() => {
  if (!props.data || props.data.length === 0) return []
  return props.data.map(d => ({
    name: new Date(d.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    value: d.value,
  }))
})

const chartOption = computed(() => ({
  backgroundColor: 'transparent',
  grid: {
    left: '3%',
    right: '4%',
    bottom: '3%',
    top: '10%',
    containLabel: true,
  },
  tooltip: {
    trigger: 'axis',
    backgroundColor: 'rgba(30, 41, 59, 0.9)',
    borderColor: '#475569',
    textStyle: {
      color: '#f1f5f9',
    },
    formatter: (params: any) => {
      const item = params[0]
      return `${item.axisValue}<br/><span style="color:${props.color || '#3b82f6'}">●</span> ${props.title || '数值'}: <strong>${item.value}${props.unit || ''}</strong>`
    },
  },
  xAxis: {
    type: 'category',
    boundaryGap: false,
    data: chartData.value.map(d => d.name),
    axisLine: {
      lineStyle: { color: '#475569' },
    },
    axisLabel: {
      color: '#94a3b8',
      fontSize: 10,
    },
    splitLine: {
      show: false,
    },
  },
  yAxis: {
    type: 'value',
    axisLine: {
      show: false,
    },
    axisLabel: {
      color: '#94a3b8',
      fontSize: 10,
    },
    splitLine: {
      lineStyle: {
        color: '#334155',
      },
    },
  },
  series: [
    {
      name: props.title || '数据',
      type: 'line',
      smooth: true,
      symbol: 'none',
      sampling: 'lttb',
      itemStyle: {
        color: props.color || '#3b82f6',
      },
      lineStyle: {
        width: 2,
        color: props.color || '#3b82f6',
      },
      areaStyle: {
        color: {
          type: 'linear',
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: (props.color || '#3b82f6') + '40' },
            { offset: 1, color: (props.color || '#3b82f6') + '00' },
          ],
        },
      },
      data: chartData.value.map(d => d.value),
    },
  ],
}))
</script>

<template>
  <div class="h-64">
    <v-chart :option="chartOption" autoresize />
  </div>
</template>

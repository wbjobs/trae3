
<script setup lang="ts">
import { computed, watch, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { GaugeChart } from 'echarts/charts'
import { CanvasRenderer } from 'echarts/renderers'

use([GaugeChart, CanvasRenderer])

const props = defineProps<{
  value: number
  name: string
  min?: number
  max?: number
  unit?: string
  warnThreshold?: number
  alarmThreshold?: number
  color?: string
}>()

const currentValue = ref(props.value)

watch(() => props.value, (newVal) => {
  currentValue.value = newVal
})

const chartOption = computed(() => ({
  series: [
    {
      type: 'gauge',
      startAngle: 180,
      endAngle: 0,
      min: props.min || 0,
      max: props.max || 100,
      splitNumber: 5,
      itemStyle: {
        color: props.color || '#3b82f6',
        shadowColor: props.color || '#3b82f6',
        shadowBlur: 10,
      },
      progress: {
        show: true,
        roundCap: true,
        width: 18,
      },
      pointer: {
        show: false,
      },
      axisLine: {
        roundCap: true,
        lineStyle: {
          width: 18,
          color: [
            [1, 'rgba(100, 116, 139, 0.2)'],
          ],
        },
      },
      axisTick: {
        show: false,
      },
      splitLine: {
        show: false,
      },
      axisLabel: {
        show: false,
      },
      anchor: {
        show: false,
      },
      title: {
        show: true,
        offsetCenter: [0, '60%'],
        fontSize: 12,
        color: '#94a3b8',
      },
      detail: {
        valueAnimation: true,
        fontSize: 24,
        offsetCenter: [0, '20%'],
        formatter: `{value}${props.unit || ''}`,
        color: '#fff',
        fontFamily: 'monospace',
      },
      data: [
        {
          value: currentValue.value,
          name: props.name,
        },
      ],
    },
  ],
}))
</script>

<template>
  <div class="h-32">
    <v-chart :option="chartOption" autoresize />
  </div>
</template>

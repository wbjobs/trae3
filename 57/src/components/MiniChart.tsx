import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer])

const hours = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`)

const mockData = {
  waterLevel: [12.1, 12.3, 12.5, 12.4, 12.8, 13.0, 12.9, 13.2, 13.1, 13.3, 13.5, 13.2, 12.9, 12.7, 12.5, 12.6, 12.8, 13.0, 12.7, 12.5, 12.3, 12.2, 12.1, 12.0],
  flowRate: [160, 158, 155, 157, 152, 150, 148, 155, 157, 156, 158, 160, 162, 155, 150, 148, 152, 155, 158, 160, 162, 165, 163, 160],
}

export default function MiniChart() {
  const option = {
    backgroundColor: 'transparent',
    grid: { top: 30, right: 12, bottom: 30, left: 45 },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: 'rgba(15, 43, 70, 0.95)',
      borderColor: 'rgba(0, 212, 170, 0.3)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
    xAxis: {
      type: 'category' as const,
      data: hours,
      axisLine: { lineStyle: { color: '#1A3A5C' } },
      axisLabel: { color: '#64748B', fontSize: 10 },
      axisTick: { show: false },
    },
    yAxis: [
      {
        type: 'value' as const,
        name: '水位(m)',
        nameTextStyle: { color: '#64748B', fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
      },
      {
        type: 'value' as const,
        name: '流量(m³/s)',
        nameTextStyle: { color: '#64748B', fontSize: 10 },
        axisLine: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    dataZoom: [
      {
        type: 'inside' as const,
        start: 0,
        end: 100,
      },
    ],
    series: [
      {
        name: '水位',
        type: 'line',
        data: mockData.waterLevel,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#00D4AA', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 212, 170, 0.3)' },
            { offset: 1, color: 'rgba(0, 212, 170, 0.02)' },
          ]),
        },
      },
      {
        name: '流量',
        type: 'line',
        data: mockData.flowRate,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3B82F6', width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59, 130, 246, 0.2)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0.02)' },
          ]),
        },
        yAxisIndex: 1,
      },
    ],
  }

  return (
    <div className="card-hover p-4 h-full animate-slide-up" style={{ animationDelay: '300ms' }}>
      <h3 className="text-sm font-semibold text-gray-300 mb-3">今日水位/流量趋势</h3>
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height: '220px' }}
        notMerge
        lazyUpdate
      />
    </div>
  )
}

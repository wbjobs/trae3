import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, CanvasRenderer])

interface RainfallWaterChartProps {
  data: Array<{ timestamp: string; values: Record<string, number | null> }>
  metricLabels?: Record<string, string>
}

function RainfallWaterChart({ data, metricLabels = {} }: RainfallWaterChartProps) {
  const option = useMemo(() => {
    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { top: 30, right: 55, bottom: 50, left: 55 },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(15, 43, 70, 0.95)',
        borderColor: 'rgba(0, 212, 170, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        axisPointer: {
          type: 'cross',
          lineStyle: { color: '#00D4AA', opacity: 0.5 },
        },
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: '#94A3B8', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: 'time' as const,
        axisLine: { lineStyle: { color: '#1A3A5C' } },
        axisLabel: {
          color: '#64748B',
          fontSize: 10,
          formatter: (value: number) => {
            const d = new Date(value)
            return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:00`
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: metricLabels.waterLevel || '水位 (m)',
          nameTextStyle: { color: '#94A3B8', fontSize: 11 },
          axisLine: { show: false },
          axisLabel: { color: '#64748B', fontSize: 10 },
          splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
        },
        {
          type: 'value' as const,
          name: metricLabels.rainfall || '降雨量 (mm)',
          nameTextStyle: { color: '#94A3B8', fontSize: 11 },
          axisLine: { show: false },
          axisLabel: { color: '#64748B', fontSize: 10 },
          splitLine: { show: false },
          inverse: true,
        },
      ],
      dataZoom: [
        {
          type: 'inside' as const,
          start: 0,
          end: 100,
        },
        {
          type: 'slider' as const,
          start: 0,
          end: 100,
          height: 20,
          bottom: 5,
          borderColor: '#1A3A5C',
          fillerColor: 'rgba(0, 212, 170, 0.15)',
          handleStyle: { color: '#00D4AA' },
          textStyle: { color: '#64748B' },
        },
      ],
      series: [
        {
          name: metricLabels.waterLevel || '水位',
          type: 'line',
          data: data.map((d) => [d.timestamp, d.values.waterLevel]),
          smooth: true,
          symbol: 'none',
          showSymbol: false,
          sampling: 'lttb',
          lineStyle: { color: '#00D4AA', width: 2 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(0, 212, 170, 0.3)' },
              { offset: 1, color: 'rgba(0, 212, 170, 0.02)' },
            ]),
          },
          yAxisIndex: 0,
        },
        {
          name: metricLabels.rainfall || '降雨量',
          type: 'bar',
          data: data.map((d) => [d.timestamp, d.values.rainfall]),
          barWidth: '60%',
          large: true,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59, 130, 246, 0.6)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.1)' },
            ]),
            borderRadius: [2, 2, 0, 0],
          },
          yAxisIndex: 1,
        },
      ],
    }
  }, [data, metricLabels])

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: '400px' }}
      notMerge={false}
      lazyUpdate={true}
    />
  )
}

export default React.memo(RainfallWaterChart)

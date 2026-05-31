import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, CanvasRenderer])

const COLORS = ['#00D4AA', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6']

interface TimeSeriesChartProps {
  data: Array<{ timestamp: string; values: Record<string, number | null> }>
  metrics: string[]
  title?: string
  metricLabels?: Record<string, string>
  metricUnits?: Record<string, string>
}

function TimeSeriesChart({
  data,
  metrics,
  title,
  metricLabels = {},
  metricUnits = {},
}: TimeSeriesChartProps) {
  const option = useMemo(() => {
    const series = metrics.map((metric, idx) => ({
      name: metricLabels[metric] || metric,
      type: 'line' as const,
      data: data.map((d) => [d.timestamp, d.values[metric]]),
      smooth: true,
      symbol: 'none',
      sampling: 'lttb',
      showSymbol: false,
      lineStyle: { color: COLORS[idx % COLORS.length], width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: COLORS[idx % COLORS.length] + '40' },
          { offset: 1, color: COLORS[idx % COLORS.length] + '05' },
        ]),
      },
    }))

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: title
        ? { text: title, textStyle: { color: '#94A3B8', fontSize: 13, fontWeight: 500 }, left: 0, top: 0 }
        : undefined,
      grid: { top: title ? 40 : 20, right: 20, bottom: 50, left: 55 },
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
        top: title ? 5 : 0,
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
            return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
          },
        },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
      },
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
      series,
    }
  }, [data, metrics, title, metricLabels])

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

export default React.memo(TimeSeriesChart)

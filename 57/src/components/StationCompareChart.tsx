import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, DataZoomComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, LegendComponent, CanvasRenderer])

const COLORS = ['#00D4AA', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

interface StationSeries {
  stationName: string
  data: Array<{ timestamp: string; value: number | null }>
}

interface StationCompareChartProps {
  metric: string
  stations: StationSeries[]
  metricLabel?: string
  metricUnit?: string
}

function StationCompareChart({
  metric,
  stations,
  metricLabel,
  metricUnit,
}: StationCompareChartProps) {
  const option = useMemo(() => {
    if (stations.length === 0) return {}

    const series = stations.map((s, idx) => ({
      name: s.stationName,
      type: 'line' as const,
      data: s.data.map((d) => [d.timestamp, d.value]),
      smooth: true,
      symbol: 'none',
      showSymbol: false,
      sampling: 'lttb',
      lineStyle: { color: COLORS[idx % COLORS.length], width: 2 },
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: COLORS[idx % COLORS.length] + '25' },
          { offset: 1, color: COLORS[idx % COLORS.length] + '03' },
        ]),
      },
    }))

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { top: 40, right: 20, bottom: 50, left: 55 },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(15, 43, 70, 0.95)',
        borderColor: 'rgba(0, 212, 170, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
      },
      legend: {
        top: 0,
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
      yAxis: {
        type: 'value' as const,
        name: `${metricLabel || metric} (${metricUnit || ''})`,
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
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
  }, [stations, metric, metricLabel, metricUnit])

  if (stations.length === 0) return null

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

export default React.memo(StationCompareChart)

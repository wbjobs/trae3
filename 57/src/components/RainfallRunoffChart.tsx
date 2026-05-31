import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { RainfallRunoffResult } from '../../shared/types'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, CanvasRenderer])

interface RainfallRunoffChartProps {
  data: RainfallRunoffResult
}

function RainfallRunoffChart({ data }: RainfallRunoffChartProps) {
  const option = useMemo(() => {
    const timestamps = data.rainfallSeries.map((r) => r.timestamp)

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { top: 40, right: 55, bottom: 50, left: 55 },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(15, 43, 70, 0.95)',
        borderColor: 'rgba(0, 212, 170, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: '#94A3B8', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: 'category' as const,
        data: timestamps.map((t) => {
          const d = new Date(t)
          return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:00`
        }),
        axisLine: { lineStyle: { color: '#1A3A5C' } },
        axisLabel: { color: '#64748B', fontSize: 10, rotate: 30 },
        axisTick: { show: false },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: '降雨量 (mm)',
          nameTextStyle: { color: '#94A3B8', fontSize: 11 },
          axisLine: { show: false },
          axisLabel: { color: '#64748B', fontSize: 10 },
          splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
          inverse: true,
        },
        {
          type: 'value' as const,
          name: '流量 (m³/s)',
          nameTextStyle: { color: '#94A3B8', fontSize: 11 },
          axisLine: { show: false },
          axisLabel: { color: '#64748B', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: '降雨量',
          type: 'bar',
          data: data.rainfallSeries.map((r) => r.value),
          barWidth: '60%',
          large: true,
          itemStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: 'rgba(59, 130, 246, 0.6)' },
              { offset: 1, color: 'rgba(59, 130, 246, 0.1)' },
            ]),
            borderRadius: [2, 2, 0, 0],
          },
          yAxisIndex: 0,
        },
        {
          name: '流量',
          type: 'line',
          data: data.flowSeries.map((f) => f.value),
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
          yAxisIndex: 1,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed' as const, color: '#F59E0B', width: 2 },
            data: [
              {
                xAxis: Math.min(
                  data.responseTimeHours,
                  timestamps.length - 1
                ),
              },
            ],
            label: {
              show: true,
              position: 'insideEndTop',
              formatter: `响应时间: ${data.responseTimeHours}h\n相关系数: ${data.maxCorrelation.toFixed(3)}`,
              color: '#F59E0B',
              fontSize: 10,
              lineHeight: 16,
            },
          },
        },
      ],
    }
  }, [data])

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

export default React.memo(RainfallRunoffChart)

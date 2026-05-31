import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { UpstreamDownstreamResult } from '../../shared/types'

echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const COLORS = ['#00D4AA', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899']

interface WatershedLinkageChartProps {
  data: UpstreamDownstreamResult
}

function WatershedLinkageChart({ data }: WatershedLinkageChartProps) {
  const option = useMemo(() => {
    if (data.pairs.length === 0) return {}

    const series = data.pairs.map((pair, idx) => {
      const maxLag = Math.ceil(pair.lagHours * 2.5)
      const lags = Array.from({ length: maxLag + 1 }, (_, i) => i)
      const correlations = lags.map((lag) => {
        const diff = lag - pair.lagHours
        return Math.max(0, pair.maxCorrelation * Math.exp(-(diff * diff) / (2 * (pair.lagHours * 0.3 + 1) ** 2)))
      })

      const upstreamStation = data.stations.find((s) => s.id === pair.upstream)
      const downstreamStation = data.stations.find((s) => s.id === pair.downstream)
      const name = `${upstreamStation?.name || pair.upstream} → ${downstreamStation?.name || pair.downstream}`

      return {
        name,
        type: 'line' as const,
        data: lags.map((lag, i) => [lag, correlations[i]]),
        smooth: true,
        symbol: 'none',
        showSymbol: false,
        lineStyle: { color: COLORS[idx % COLORS.length], width: 2 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: COLORS[idx % COLORS.length] + '20' },
            { offset: 1, color: COLORS[idx % COLORS.length] + '02' },
          ]),
        },
        markPoint: {
          data: [
            {
              coord: [Math.round(pair.lagHours), pair.maxCorrelation],
              symbol: 'circle',
              symbolSize: 10,
              itemStyle: { color: COLORS[idx % COLORS.length] },
              label: {
                show: true,
                formatter: `滞后${Math.round(pair.lagHours)}h`,
                position: 'top',
                color: '#e2e8f0',
                fontSize: 10,
              },
            },
          ],
        },
      }
    })

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: `${data.river} 上下游关联分析`,
        textStyle: { color: '#94A3B8', fontSize: 13, fontWeight: 500 },
        left: 0,
        top: 0,
      },
      grid: { top: 50, right: 20, bottom: 40, left: 55 },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(15, 43, 70, 0.95)',
        borderColor: 'rgba(0, 212, 170, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
      },
      legend: {
        top: 25,
        right: 0,
        textStyle: { color: '#94A3B8', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: 'value' as const,
        name: '时间滞后 (小时)',
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        axisLine: { lineStyle: { color: '#1A3A5C' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
      },
      yAxis: {
        type: 'value' as const,
        name: '相关系数',
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        axisLine: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
        min: 0,
        max: 1,
      },
      series,
    }
  }, [data])

  if (data.pairs.length === 0) return null

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

export default React.memo(WatershedLinkageChart)

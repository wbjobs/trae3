import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { ScatterChart, CustomChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, MarkLineComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { ExtremeStatistics } from '../../shared/types'
import { METRIC_LABELS, METRIC_UNITS } from '../../shared/types'

echarts.use([ScatterChart, CustomChart, GridComponent, TooltipComponent, MarkLineComponent, CanvasRenderer])

interface ExtremeChartProps {
  stats: ExtremeStatistics
}

function ExtremeChart({ stats }: ExtremeChartProps) {
  const option = useMemo(() => {
    const { percentiles, min, max, mean, currentValue, metric } = stats
    const label = METRIC_LABELS[metric] || metric
    const unit = METRIC_UNITS[metric] || ''

    return {
      backgroundColor: 'transparent',
      animation: false,
      title: {
        text: `${label} 极值分析`,
        textStyle: { color: '#94A3B8', fontSize: 13, fontWeight: 500 },
        left: 0,
        top: 0,
      },
      grid: { top: 40, right: 20, bottom: 30, left: 60 },
      tooltip: {
        backgroundColor: 'rgba(15, 43, 70, 0.95)',
        borderColor: 'rgba(0, 212, 170, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: () => {
          return `
            <div style="font-size:12px">
              <div><b>最小值:</b> ${min.toFixed(2)} ${unit}</div>
              <div><b>P50:</b> ${percentiles.p50.toFixed(2)} ${unit}</div>
              <div><b>P75:</b> ${percentiles.p75.toFixed(2)} ${unit}</div>
              <div><b>P90:</b> ${percentiles.p90.toFixed(2)} ${unit}</div>
              <div><b>P95:</b> ${percentiles.p95.toFixed(2)} ${unit}</div>
              <div><b>P99:</b> ${percentiles.p99.toFixed(2)} ${unit}</div>
              <div><b>最大值:</b> ${max.toFixed(2)} ${unit}</div>
              <div style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.1);padding-top:4px">
                <b>当前值:</b> <span style="color:#00D4AA">${currentValue.toFixed(2)} ${unit}</span>
              </div>
              <div><b>均值:</b> ${mean.toFixed(2)} ${unit}</div>
            </div>
          `
        },
      },
      xAxis: {
        type: 'category' as const,
        data: [label],
        axisLine: { lineStyle: { color: '#1A3A5C' } },
        axisLabel: { color: '#64748B', fontSize: 11 },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        name: `${label} (${unit})`,
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        axisLine: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
      },
      series: [
        {
          type: 'custom',
          renderItem: (_params: Record<string, unknown>, api: { value: (i: number) => number; coord: (v: number[]) => number[] }) => {
            const categoryIndex = api.value(0)
            const start = api.coord([categoryIndex, api.value(1)])

            const sections = [
              { from: min, to: percentiles.p50, color: 'rgba(59, 130, 246, 0.25)' },
              { from: percentiles.p50, to: percentiles.p75, color: 'rgba(59, 130, 246, 0.35)' },
              { from: percentiles.p75, to: percentiles.p90, color: 'rgba(245, 158, 11, 0.35)' },
              { from: percentiles.p90, to: percentiles.p95, color: 'rgba(249, 115, 22, 0.35)' },
              { from: percentiles.p95, to: percentiles.p99, color: 'rgba(239, 68, 68, 0.35)' },
              { from: percentiles.p99, to: max, color: 'rgba(239, 68, 68, 0.5)' },
            ]

            const rectWidth = 60
            const x = start[0] - rectWidth / 2
            const children: Record<string, unknown>[] = []

            sections.forEach((sec) => {
              const secStart = api.coord([categoryIndex, sec.from])
              const secEnd = api.coord([categoryIndex, sec.to])
              const secHeight = secStart[1] - secEnd[1]
              children.push({
                type: 'rect',
                shape: { x, y: secEnd[1], width: rectWidth, height: Math.max(secHeight, 1) },
                style: { fill: sec.color, stroke: 'rgba(255,255,255,0.05)' },
              })
            })

            return { type: 'group', children }
          },
          data: [[0, min, max]],
          z: 1,
        },
        {
          type: 'scatter',
          data: [[0, currentValue]],
          symbolSize: 12,
          itemStyle: {
            color: '#00D4AA',
            borderColor: '#fff',
            borderWidth: 2,
          },
          z: 10,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed' as const, color: '#00D4AA', width: 1, opacity: 0.6 },
            data: [{ yAxis: currentValue }],
            label: {
              show: true,
              position: 'insideEndTop',
              formatter: `当前: ${currentValue.toFixed(2)}`,
              color: '#00D4AA',
              fontSize: 10,
            },
          },
        },
      ],
    }
  }, [stats])

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: '300px' }}
      notMerge={false}
      lazyUpdate={true}
    />
  )
}

export default React.memo(ExtremeChart)

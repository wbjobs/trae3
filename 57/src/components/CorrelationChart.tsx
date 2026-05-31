import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { ScatterChart, LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([ScatterChart, LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

interface CorrelationChartProps {
  data: Array<{
    x: number
    y: number
    size?: number
    name?: string
  }>
  xLabel: string
  yLabel: string
  sizeLabel?: string
}

function CorrelationChart({
  data,
  xLabel,
  yLabel,
  sizeLabel,
}: CorrelationChartProps) {
  const option = useMemo(() => {
    if (data.length === 0) return {}

    const xs = data.map((d) => d.x)
    const ys = data.map((d) => d.y)
    const n = data.length

    const meanX = xs.reduce((a, b) => a + b, 0) / n
    const meanY = ys.reduce((a, b) => a + b, 0) / n
    let num = 0
    let denX = 0
    let denY = 0
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX
      const dy = ys[i] - meanY
      num += dx * dy
      denX += dx * dx
      denY += dy * dy
    }
    const slope = denX !== 0 ? num / denX : 0
    const intercept = meanY - slope * meanX

    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)
    const regressionLine = [
      [xMin, slope * xMin + intercept],
      [xMax, slope * xMax + intercept],
    ]

    const maxSize = Math.max(...data.map((d) => d.size || 1))

    return {
      backgroundColor: 'transparent',
      animation: false,
      grid: { top: 30, right: 20, bottom: 45, left: 55 },
      tooltip: {
        backgroundColor: 'rgba(15, 43, 70, 0.95)',
        borderColor: 'rgba(0, 212, 170, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: any) => {
          if (params.seriesType === 'scatter') {
            const d = params.data
            return `${d[3] || ''}<br/>${xLabel}: ${d[0].toFixed(2)}<br/>${yLabel}: ${d[1].toFixed(2)}${sizeLabel ? `<br/>${sizeLabel}: ${d[2].toFixed(2)}` : ''}`
          }
          return ''
        },
      },
      legend: {
        top: 0,
        right: 0,
        textStyle: { color: '#94A3B8', fontSize: 11 },
      },
      xAxis: {
        type: 'value' as const,
        name: xLabel,
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        axisLine: { lineStyle: { color: '#1A3A5C' } },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
      },
      yAxis: {
        type: 'value' as const,
        name: yLabel,
        nameTextStyle: { color: '#94A3B8', fontSize: 11 },
        axisLine: { show: false },
        axisLabel: { color: '#64748B', fontSize: 10 },
        splitLine: { lineStyle: { color: '#1A3A5C', type: 'dashed' as const } },
      },
      series: [
        {
          name: '数据点',
          type: 'scatter',
          data: data.map((d) => [d.x, d.y, d.size || 1, d.name || '']),
          symbolSize: (val: number[]) => {
            return maxSize > 0 ? 8 + (val[2] / maxSize) * 20 : 10
          },
          itemStyle: {
            color: new echarts.graphic.RadialGradient(0.5, 0.5, 0.5, [
              { offset: 0, color: 'rgba(0, 212, 170, 0.8)' },
              { offset: 1, color: 'rgba(0, 212, 170, 0.2)' },
            ]),
          },
        },
        {
          name: '回归线',
          type: 'line',
          data: regressionLine,
          smooth: false,
          symbol: 'none',
          showSymbol: false,
          lineStyle: { color: '#F59E0B', width: 2, type: 'dashed' as const },
        },
      ],
    }
  }, [data, xLabel, yLabel, sizeLabel])

  if (data.length === 0) return null

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

export default React.memo(CorrelationChart)

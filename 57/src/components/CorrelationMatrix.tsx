import React, { useMemo } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { HeatmapChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { CrossStationCorrelation } from '../../shared/types'

echarts.use([HeatmapChart, GridComponent, TooltipComponent, VisualMapComponent, CanvasRenderer])

interface CorrelationMatrixProps {
  data: CrossStationCorrelation
}

function CorrelationMatrix({ data }: CorrelationMatrixProps) {
  const stationNames = useMemo(() => {
    const nameSet = new Set<string>()
    data.correlations.forEach((c) => {
      nameSet.add(c.stationAName)
      nameSet.add(c.stationBName)
    })
    return Array.from(nameSet)
  }, [data.correlations])

  const option = useMemo(() => {
    if (stationNames.length === 0) return {}

    const heatmapData: [number, number, number][] = []
    data.correlations.forEach((c) => {
      const rowIdx = stationNames.indexOf(c.stationAName)
      const colIdx = stationNames.indexOf(c.stationBName)
      if (rowIdx >= 0 && colIdx >= 0) {
        heatmapData.push([colIdx, rowIdx, parseFloat(c.coefficient.toFixed(3))])
        heatmapData.push([rowIdx, colIdx, parseFloat(c.coefficient.toFixed(3))])
      }
    })

    for (let i = 0; i < stationNames.length; i++) {
      heatmapData.push([i, i, 1.0])
    }

    return {
      backgroundColor: 'transparent',
      animation: false,
      tooltip: {
        backgroundColor: 'rgba(15, 43, 70, 0.95)',
        borderColor: 'rgba(0, 212, 170, 0.3)',
        textStyle: { color: '#e2e8f0', fontSize: 12 },
        formatter: (params: { data: number[] }) => {
          const [x, y, value] = params.data
          return `${stationNames[y]} × ${stationNames[x]}<br/>相关系数: <b>${value}</b>`
        },
      },
      grid: { top: 10, right: 80, bottom: 60, left: 80 },
      xAxis: {
        type: 'category' as const,
        data: stationNames,
        axisLine: { lineStyle: { color: '#1A3A5C' } },
        axisLabel: { color: '#94A3B8', fontSize: 10, rotate: 30 },
        axisTick: { show: false },
        splitArea: { show: false },
      },
      yAxis: {
        type: 'category' as const,
        data: stationNames,
        axisLine: { lineStyle: { color: '#1A3A5C' } },
        axisLabel: { color: '#94A3B8', fontSize: 10 },
        axisTick: { show: false },
        splitArea: { show: false },
      },
      visualMap: {
        min: -1,
        max: 1,
        calculable: true,
        orient: 'vertical' as const,
        right: 0,
        top: 'center',
        inRange: {
          color: ['#3B82F6', '#1A3A5C', '#0F2B46', '#4A2A1A', '#EF4444'],
        },
        textStyle: { color: '#94A3B8', fontSize: 10 },
      },
      series: [
        {
          type: 'heatmap',
          data: heatmapData,
          label: {
            show: true,
            color: '#e2e8f0',
            fontSize: 9,
            formatter: (params: { value: number[] }) => params.value[2].toFixed(2),
          },
          emphasis: {
            itemStyle: {
              borderColor: '#00D4AA',
              borderWidth: 2,
            },
          },
          itemStyle: {
            borderColor: '#0A1E33',
            borderWidth: 2,
          },
        },
      ],
    }
  }, [data, stationNames])

  if (stationNames.length === 0) return null

  return (
    <ReactEChartsCore
      echarts={echarts}
      option={option}
      style={{ height: '500px' }}
      notMerge={false}
      lazyUpdate={true}
    />
  )
}

export default React.memo(CorrelationMatrix)

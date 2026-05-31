import { useEffect, useState, useMemo, useRef } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkAreaComponent,
  LegendComponent,
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { useMonitorStore } from '@/stores/monitorStore'
import type { MetricSeries, AnomalyRecord, MetricType } from '../../shared/types'

echarts.use([
  LineChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkAreaComponent,
  LegendComponent,
  CanvasRenderer,
])

const metricColor: Record<MetricType, string> = {
  cpu: '#06d6a0',
  memory: '#3b82f6',
  disk: '#f59e0b',
  network: '#a78bfa',
}

function getTimeRange(range: string) {
  const now = new Date()
  const end = now.toISOString()
  let start: Date
  switch (range) {
    case '6h':
      start = new Date(now.getTime() - 6 * 3600000)
      break
    case '24h':
      start = new Date(now.getTime() - 24 * 3600000)
      break
    case '7d':
      start = new Date(now.getTime() - 7 * 86400000)
      break
    default:
      start = new Date(now.getTime() - 3600000)
  }
  return { startTime: start.toISOString(), endTime: end }
}

interface MetricChartProps {
  series?: MetricSeries[]
  anomalies?: AnomalyRecord[]
  height?: string
}

function isSeriesEqual(a: MetricSeries[], b: MetricSeries[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].metricType !== b[i].metricType) return false
    if (a[i].serviceName !== b[i].serviceName) return false
    if (a[i].nodeId !== b[i].nodeId) return false
    if (a[i].data.length !== b[i].data.length) return false
    if (a[i].data.length === 0) continue
    const lastA = a[i].data[a[i].data.length - 1]
    const lastB = b[i].data[b[i].data.length - 1]
    if (lastA.timestamp !== lastB.timestamp || lastA.value !== lastB.value) return false
  }
  return true
}

export default function MetricChart({ series: externalSeries, anomalies: externalAnomalies, height = '320px' }: MetricChartProps) {
  const { filters } = useMonitorStore()
  const [fetchedSeries, setFetchedSeries] = useState<MetricSeries[]>([])
  const anomalies = useMonitorStore((s) => s.anomalies)
  const prevSeriesRef = useRef<MetricSeries[]>([])
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const data = externalSeries ?? fetchedSeries
  const anomalyData = externalAnomalies ?? anomalies

  useEffect(() => {
    if (externalSeries) return

    if (fetchTimeoutRef.current) {
      clearTimeout(fetchTimeoutRef.current)
    }

    fetchTimeoutRef.current = setTimeout(() => {
      const { startTime, endTime } = getTimeRange(filters.timeRange)
      const params = new URLSearchParams()
      params.set('startTime', startTime)
      params.set('endTime', endTime)
      params.set('metricTypes', filters.metricTypes.join(','))
      if (filters.serviceNames.length) params.set('serviceNames', filters.serviceNames.join(','))
      if (filters.nodeIds.length) params.set('nodeIds', filters.nodeIds.join(','))

      fetch(`/api/metrics?${params}`)
        .then((res) => res.json())
        .then((d) => {
          const newSeries = d.series ?? []
          if (!isSeriesEqual(prevSeriesRef.current, newSeries)) {
            prevSeriesRef.current = newSeries
            setFetchedSeries(newSeries)
          }
        })
        .catch(() => {})
    }, 300)

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
    }
  }, [filters, externalSeries])

  const option = useMemo(() => {
    const seriesList = data.map((s) => {
      const chartData = s.data.map((d) => [d.timestamp, isNaN(d.value) ? null : d.value])
      return {
        name: `${s.metricType} - ${s.nodeId}`,
        type: 'line' as const,
        smooth: true,
        symbol: 'none',
        sampling: 'lttb',
        lineStyle: { width: 2, color: metricColor[s.metricType] },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: metricColor[s.metricType] + '40' },
            { offset: 1, color: metricColor[s.metricType] + '05' },
          ]),
        },
        connectNulls: true,
        data: chartData,
      }
    })

    const markAreas = anomalyData
      .filter((a) => !a.recoveredAt)
      .map((a) => ({
        name: a.description,
        xAxis: a.detectedAt,
      }))

    if (markAreas.length > 0 && seriesList.length > 0) {
      seriesList[0] = {
        ...seriesList[0],
        markArea: {
          silent: true,
          itemStyle: { color: 'rgba(239,68,68,0.08)' },
          data: markAreas.map((m) => [{ xAxis: m.xAxis }, { xAxis: m.xAxis }]),
        },
      } as any
    }

    return {
      backgroundColor: 'transparent',
      textStyle: { color: '#64748b', fontFamily: 'monospace' },
      grid: { top: 20, right: 20, bottom: 60, left: 50 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1e293b',
        borderColor: '#334155',
        textStyle: { color: '#e2e8f0', fontFamily: 'monospace', fontSize: 12 },
        axisPointer: { type: 'cross', lineStyle: { color: '#334155' } },
      },
      legend: {
        show: seriesList.length > 1,
        top: 0,
        right: 20,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b', fontFamily: 'monospace', fontSize: 10 },
        splitLine: { show: false },
        min: 'dataMin',
        max: 'dataMax',
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLine: { show: false },
        axisLabel: {
          color: '#64748b',
          fontFamily: 'monospace',
          fontSize: 10,
          formatter: '{value}%',
        },
        splitLine: { lineStyle: { color: '#1e293b' } },
      },
      dataZoom: [
        {
          type: 'inside',
          start: 0,
          end: 100,
        },
        {
          type: 'slider',
          bottom: 10,
          height: 20,
          borderColor: '#334155',
          backgroundColor: '#0f172a',
          fillerColor: 'rgba(6,214,160,0.15)',
          handleStyle: { color: '#06d6a0' },
          textStyle: { color: '#64748b' },
        },
      ],
      series: seriesList,
    }
  }, [data, anomalyData])

  return (
    <div className="bg-ops-card rounded-xl border border-ops-border p-4 animate-fade-in">
      <ReactEChartsCore
        echarts={echarts}
        option={option}
        style={{ height, width: '100%' }}
        lazyUpdate
        notMerge={false}
      />
    </div>
  )
}

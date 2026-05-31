import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
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
import { useSSE } from '@/hooks/useSSE'
import type { MetricSeries, AnomalyRecord, MetricType, MetricDataPoint, SSEMessage } from '../../shared/types'
import { Activity, Wifi, Clock } from 'lucide-react'

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

const MAX_POINTS = 300

interface MetricBatchData {
  series: {
    metricType: MetricType
    serviceName: string
    nodeId: string
    data: MetricDataPoint[]
  }[]
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

interface StreamingMetricChartProps {
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
  }
  return true
}

function getSeriesKey(s: { metricType: string; serviceName: string; nodeId: string }) {
  return `${s.metricType}-${s.serviceName}-${s.nodeId}`
}

export default function StreamingMetricChart({ series: externalSeries, anomalies: externalAnomalies, height = '320px' }: StreamingMetricChartProps) {
  const { filters, streamStats } = useMonitorStore()
  const [fetchedSeries, setFetchedSeries] = useState<MetricSeries[]>([])
  const [streamingData, setStreamingData] = useState<Map<string, MetricDataPoint[]>>(new Map())
  const [latency, setLatency] = useState<number>(0)
  const anomalies = useMonitorStore((s) => s.anomalies)
  const prevSeriesRef = useRef<MetricSeries[]>([])
  const fetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastUpdateRef = useRef<number>(0)

  const { latestMessage } = useSSE()

  const baseSeries = externalSeries ?? fetchedSeries
  const anomalyData = externalAnomalies ?? anomalies

  const handleSSEMessage = useCallback((msg: SSEMessage | null) => {
    if (!msg || msg.type !== 'metric_batch') return

    const now = Date.now()
    const msgTime = new Date(msg.timestamp).getTime()
    setLatency(now - msgTime)
    lastUpdateRef.current = now

    const batch = msg.data as MetricBatchData
    if (!batch.series) return

    setStreamingData((prev) => {
      const next = new Map(prev)
      batch.series.forEach((s) => {
        const key = getSeriesKey(s)
        const existing = next.get(key) || []
        const combined = [...existing, ...s.data]
        const trimmed = combined.slice(-MAX_POINTS)
        next.set(key, trimmed)
      })
      return next
    })
  }, [])

  useEffect(() => {
    handleSSEMessage(latestMessage)
  }, [latestMessage, handleSSEMessage])

  const mergedSeries = useMemo(() => {
    return baseSeries.map((s) => {
      const key = getSeriesKey(s)
      const streamPoints = streamingData.get(key) || []
      if (streamPoints.length === 0) return s

      const allPoints = [...s.data, ...streamPoints]
      const uniqueMap = new Map<string, MetricDataPoint>()
      allPoints.forEach((p) => uniqueMap.set(p.timestamp, p))
      const sorted = Array.from(uniqueMap.values()).sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )
      const trimmed = sorted.slice(-MAX_POINTS)

      return { ...s, data: trimmed }
    })
  }, [baseSeries, streamingData])

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
            setStreamingData(new Map())
          }
        })
        .catch(() => {})
    }, 300)

    return () => {
      if (fetchTimeoutRef.current) clearTimeout(fetchTimeoutRef.current)
    }
  }, [filters, externalSeries])

  const option = useMemo(() => {
    const seriesList = mergedSeries.map((s) => {
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
        animation: true,
        animationDuration: 300,
        animationEasing: 'linear',
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
      grid: { top: 32, right: 20, bottom: 60, left: 50 },
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
        right: 120,
        textStyle: { color: '#94a3b8', fontSize: 11 },
        itemWidth: 12,
        itemHeight: 8,
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: '#334155' } },
        axisLabel: { color: '#64748b', fontFamily: 'monospace', fontSize: 10 },
        splitLine: { show: false },
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
      animation: true,
      animationDurationUpdate: 300,
    }
  }, [mergedSeries, anomalyData])

  const sseConnected = useMonitorStore((s) => s.sseConnected)
  const isLive = sseConnected && Date.now() - lastUpdateRef.current < 5000

  return (
    <div className="bg-ops-card rounded-xl border border-ops-border p-4 animate-fade-in relative">
      <div className="absolute top-4 right-4 flex items-center gap-3 z-10">
        <div className="flex items-center gap-1.5 text-xs">
          {isLive ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-ops-accent" />
              <span className="text-ops-accent font-mono">LIVE</span>
            </>
          ) : (
            <>
              <Activity className="w-3.5 h-3.5 text-ops-muted" />
              <span className="text-ops-muted font-mono">STATIC</span>
            </>
          )}
        </div>
        {latency > 0 && (
          <div className="flex items-center gap-1 text-xs text-ops-muted font-mono">
            <Clock className="w-3 h-3" />
            <span>{latency}ms</span>
          </div>
        )}
        {streamStats && (
          <div className="text-xs text-ops-muted font-mono">
            {streamStats.pointsPerSecond.toFixed(1)}/s
          </div>
        )}
      </div>
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

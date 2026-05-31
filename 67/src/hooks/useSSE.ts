import { useEffect, useRef, useState, useCallback } from 'react'
import type {
  SSEMessage,
  AnomalyRecord,
  HealthSummary,
  WindowAggregate,
  StreamStats,
  CorrelationResult,
  TraceResult,
  MetricDataPoint,
} from '../../shared/types'
import { useMonitorStore } from '@/stores/monitorStore'

const MAX_BACKOFF = 10000
const INITIAL_BACKOFF = 1000

interface MetricBatch {
  series: { metricType: string; serviceName: string; nodeId: string; data: MetricDataPoint[] }[]
}

export function useSSE() {
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backoffRef = useRef(INITIAL_BACKOFF)
  const lastEventIdRef = useRef<string>('')
  const [connected, setConnected] = useState(false)
  const [latestMessage, setLatestMessage] = useState<SSEMessage | null>(null)
  const messagesRef = useRef<SSEMessage[]>([])

  const {
    addAnomaly,
    resolveAnomaly,
    updateHealth,
    setSSEConnected,
    addSSEMessage,
    updateWindowAggregates,
    updateStreamStats,
    setCorrelationResult,
    setTraceResult,
  } = useMonitorStore()

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg: SSEMessage = JSON.parse(event.data)
        lastEventIdRef.current = msg.id

        if (msg.type === 'metric_batch') {
        } else if (msg.type === 'anomaly_event') {
          const anomaly = msg.data as AnomalyRecord
          if (anomaly.recoveredAt) {
            resolveAnomaly(anomaly.id)
          } else {
            addAnomaly(anomaly)
          }
        } else if (msg.type === 'health_update') {
          const health = msg.data as HealthSummary[]
          updateHealth(health)
        } else if (msg.type === 'correlation_alert') {
          const result = msg.data as CorrelationResult
          setCorrelationResult(result)
        } else if (msg.type === 'trace_result') {
          const result = msg.data as TraceResult
          setTraceResult(result)
        }

        const windowAgg = msg.data as { aggregates?: WindowAggregate[]; stats?: StreamStats }
        if (windowAgg.aggregates) {
          updateWindowAggregates(windowAgg.aggregates)
        }
        if (windowAgg.stats) {
          updateStreamStats(windowAgg.stats)
        }

        addSSEMessage(msg)
        setLatestMessage(msg)
        messagesRef.current = [...messagesRef.current.slice(-99), msg]
      } catch {
      }
    },
    [addAnomaly, resolveAnomaly, updateHealth, addSSEMessage, updateWindowAggregates, updateStreamStats, setCorrelationResult, setTraceResult]
  )

  const connect = useCallback(() => {
    if (eventSourceRef.current?.readyState === EventSource.OPEN) return

    const url = new URL('/api/stream', window.location.origin)
    if (lastEventIdRef.current) {
      url.searchParams.set('lastEventId', lastEventIdRef.current)
    }

    const eventSource = new EventSource(url.toString())

    eventSource.onopen = () => {
      setConnected(true)
      setSSEConnected(true)
      backoffRef.current = INITIAL_BACKOFF
    }

    eventSource.onmessage = handleMessage

    eventSource.onerror = () => {
      setConnected(false)
      setSSEConnected(false)
      eventSource.close()

      const backoff = Math.min(backoffRef.current * 2, MAX_BACKOFF)
      backoffRef.current = backoff
      reconnectTimer.current = setTimeout(connect, backoff)
    }

    eventSourceRef.current = eventSource
  }, [handleMessage, setSSEConnected])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      eventSourceRef.current?.close()
    }
  }, [connect])

  const messages = useMonitorStore((s) => s.sseMessages)

  return { connected, latestMessage, messages }
}

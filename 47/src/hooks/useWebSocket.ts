import { useEffect, useRef, useCallback } from 'react'
import type { WSMessage, PvDataPoint, DeviceStatus, ForecastData, SlidingWindowMetrics } from '../../shared/types'
import { useRealtimeStore } from '../store/useRealtimeStore'
import { useAnomalyStore } from '../store/useAnomalyStore'

type BufferedMessage =
  | { type: 'realtime_data'; payload: PvDataPoint }
  | { type: 'metric_update'; payload: any }
  | { type: 'device_status_batch'; payload: DeviceStatus[] }
  | { type: 'device_status_single'; payload: DeviceStatus }
  | { type: 'anomaly_event'; payload: any }
  | { type: 'forecast_update'; payload: ForecastData }
  | { type: 'window_metrics'; payload: { arrayId: string; metrics: SlidingWindowMetrics } }

const MAX_LATENCY_MS = 100
const HIGH_THRESHOLD = 50
const LOW_THRESHOLD = 20

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bufferRef = useRef<BufferedMessage[]>([])
  const animationFrameRef = useRef<number | null>(null)
  const lastFlushRef = useRef<number>(0)
  const framesWithoutFlushRef = useRef<number>(0)

  const setConnected = useRealtimeStore((s) => s.setConnected)

  const flushBuffer = useCallback(() => {
    const buffer = bufferRef.current
    if (buffer.length === 0) {
      animationFrameRef.current = null
      return
    }

    const now = performance.now()
    const timeSinceLastFlush = now - lastFlushRef.current

    if (buffer.length < LOW_THRESHOLD && timeSinceLastFlush < MAX_LATENCY_MS && framesWithoutFlushRef.current < 2) {
      framesWithoutFlushRef.current++
      animationFrameRef.current = requestAnimationFrame(flushBuffer)
      return
    }

    bufferRef.current = []
    lastFlushRef.current = now
    framesWithoutFlushRef.current = 0
    animationFrameRef.current = null

    const pvPoints: PvDataPoint[] = []
    let kpiPayload: any = null
    const devices: DeviceStatus[] = []
    let singleDevice: DeviceStatus | null = null
    let anomalyPayload: any = null
    const forecastUpdates: ForecastData[] = []
    const windowMetricsUpdates: { arrayId: string; metrics: SlidingWindowMetrics }[] = []

    for (const msg of buffer) {
      switch (msg.type) {
        case 'realtime_data':
          pvPoints.push(msg.payload as PvDataPoint)
          break
        case 'metric_update':
          kpiPayload = msg.payload
          break
        case 'device_status_batch':
          devices.push(...(msg.payload as DeviceStatus[]))
          break
        case 'device_status_single':
          singleDevice = msg.payload as DeviceStatus
          break
        case 'anomaly_event':
          anomalyPayload = msg.payload
          break
        case 'forecast_update':
          forecastUpdates.push(msg.payload as ForecastData)
          break
        case 'window_metrics':
          windowMetricsUpdates.push(msg.payload as { arrayId: string; metrics: SlidingWindowMetrics })
          break
      }
    }

    const store = useRealtimeStore.getState()
    if (pvPoints.length > 0) store.batchUpdatePvData(pvPoints)
    if (kpiPayload) store.updateKpi(kpiPayload)
    if (devices.length > 0) store.batchUpdateDevices(devices)
    if (singleDevice) store.updateDevice(singleDevice)
    if (anomalyPayload) {
      useAnomalyStore.getState().selectEvent(anomalyPayload)
    }
    for (const forecast of forecastUpdates) {
      store.updateForecast(forecast.arrayId, forecast)
    }
    for (const update of windowMetricsUpdates) {
      store.updateWindowMetrics(update.arrayId, update.metrics)
    }
  }, [])

  const scheduleFlush = useCallback(() => {
    if (animationFrameRef.current === null) {
      animationFrameRef.current = requestAnimationFrame(flushBuffer)
    }
  }, [flushBuffer])

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const host = window.location.host || 'localhost:5173'
      const wsUrl = `${protocol}//${host}/ws`

      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        setConnected(true)
      }

      ws.onclose = () => {
        setConnected(false)
        reconnectTimer.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onmessage = (event) => {
        try {
          const msg: WSMessage = JSON.parse(event.data)
          switch (msg.type) {
            case 'realtime_data':
              bufferRef.current.push({ type: 'realtime_data', payload: msg.payload as PvDataPoint })
              break
            case 'metric_update':
              bufferRef.current.push({ type: 'metric_update', payload: msg.payload })
              break
            case 'device_status': {
              const payload = msg.payload as any
              if (Array.isArray(payload)) {
                bufferRef.current.push({ type: 'device_status_batch', payload })
              } else {
                bufferRef.current.push({ type: 'device_status_single', payload })
              }
              break
            }
            case 'anomaly_event':
              bufferRef.current.push({ type: 'anomaly_event', payload: msg.payload })
              break
            case 'forecast_update':
              bufferRef.current.push({ type: 'forecast_update', payload: msg.payload as ForecastData })
              break
            case 'window_metrics':
              bufferRef.current.push({ type: 'window_metrics', payload: msg.payload as { arrayId: string; metrics: SlidingWindowMetrics } })
              break
          }
          scheduleFlush()
        } catch (e) {
          console.error('Failed to parse WS message', e)
        }
      }
    }

    connect()

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      wsRef.current?.close()
    }
  }, [scheduleFlush])

  return { isConnected: useRealtimeStore((s) => s.isConnected) }
}

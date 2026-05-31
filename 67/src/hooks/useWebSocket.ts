import { useEffect, useRef, useCallback } from 'react'
import type { WSMessage, AnomalyRecord, HealthSummary } from '../../shared/types'
import { useMonitorStore } from '@/stores/monitorStore'

const HEALTH_REFRESH_INTERVAL = 15000

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const healthRefreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastHealthRefresh = useRef<number>(0)
  const pendingHealthRefresh = useRef(false)

  const { addAnomaly, resolveAnomaly, setWsConnected, updateHealth } = useMonitorStore()

  const refreshHealth = useCallback(() => {
    const now = Date.now()
    if (now - lastHealthRefresh.current < HEALTH_REFRESH_INTERVAL) {
      if (!pendingHealthRefresh.current) {
        pendingHealthRefresh.current = true
        const delay = HEALTH_REFRESH_INTERVAL - (now - lastHealthRefresh.current)
        healthRefreshTimer.current = setTimeout(() => {
          pendingHealthRefresh.current = false
          refreshHealth()
        }, delay)
      }
      return
    }

    lastHealthRefresh.current = now
    fetch('/api/metrics/health')
      .then((res) => res.json())
      .then((data) => {
        updateHealth(data.health ?? [])
      })
      .catch(() => {})
  }, [updateHealth])

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const wsUrl = `${proto}//${window.location.host}/ws`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      setWsConnected(true)
      refreshHealth()
    }

    ws.onclose = () => {
      setWsConnected(false)
      reconnectTimer.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data)

        if (msg.type === 'anomaly_detected') {
          addAnomaly(msg.payload as AnomalyRecord)
        } else if (msg.type === 'anomaly_resolved') {
          resolveAnomaly((msg.payload as AnomalyRecord).id)
        } else if (msg.type === 'metric_update') {
          refreshHealth()
        }
      } catch {
      }
    }

    wsRef.current = ws
  }, [addAnomaly, resolveAnomaly, setWsConnected, refreshHealth])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (healthRefreshTimer.current) clearTimeout(healthRefreshTimer.current)
      wsRef.current?.close()
    }
  }, [connect])

  const connected = useMonitorStore((s) => s.wsConnected)

  return { connected }
}

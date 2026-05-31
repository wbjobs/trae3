import { useEffect, useRef, useState, useCallback } from 'react'
import { useDeviceStore } from '../stores/deviceStore'
import { useAlertStore } from '../stores/alertStore'
import type { WSMessage, Device, DeviceParam } from '../../shared/types'

interface DeviceUpdatePayload {
  id: string
  status: Device['status']
  healthScore: number
  params: Array<Pick<DeviceParam, 'key' | 'value' | 'unit'>>
}

export default function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messageQueue = useRef<WSMessage[]>([])
  const isProcessing = useRef(false)

  const updateDeviceFromWS = useDeviceStore((s) => s.updateDeviceFromWS)
  const addAlertFromWS = useDeviceStore((s) => s.addAlertFromWS)
  const fetchAlerts = useAlertStore((s) => s.fetchAlerts)

  const processQueue = useCallback(async () => {
    if (isProcessing.current || messageQueue.current.length === 0) return

    isProcessing.current = true
    const batch = messageQueue.current.splice(0, Math.min(messageQueue.current.length, 10))

    try {
      for (const msg of batch) {
        if (msg.type === 'device_updates') {
          const payload = msg.payload as DeviceUpdatePayload[]
          for (const update of payload) {
            const deviceUpdates: Partial<Device> = {
              status: update.status,
              healthScore: update.healthScore,
            }
            if (update.params.length > 0) {
              deviceUpdates.params = update.params.map((p) => ({
                ...p,
                label: p.key,
                threshold: undefined,
                timestamp: Date.now(),
                changed: true,
              }))
            }
            updateDeviceFromWS(update.id, deviceUpdates)
          }
        } else if (msg.type === 'alert') {
          addAlertFromWS(msg.payload)
          fetchAlerts()
        } else if (msg.type === 'ping') {
          if (wsRef.current?.readyState === 1) {
            try {
              wsRef.current.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
            } catch {
              // ignore send errors
            }
          }
        }
      }
    } catch (err) {
      console.warn('[WS] Queue processing error:', err)
    } finally {
      isProcessing.current = false
      if (messageQueue.current.length > 0) {
        requestAnimationFrame(() => processQueue())
      }
    }
  }, [updateDeviceFromWS, addAlertFromWS, fetchAlerts])

  const enqueueMessage = useCallback(
    (msg: WSMessage) => {
      messageQueue.current.push(msg)
      if (messageQueue.current.length > 100) {
        messageQueue.current = messageQueue.current.slice(-50)
      }
      processQueue()
    },
    [processQueue]
  )

  useEffect(() => {
    let reconnectAttempts = 0
    const MAX_RECONNECT_ATTEMPTS = 10

    function connect() {
      try {
        const wsUrl = `ws://${window.location.hostname}:3001/ws`
        const ws = new WebSocket(wsUrl)
        wsRef.current = ws

        ws.onopen = () => {
          setConnected(true)
          reconnectAttempts = 0
          console.log('[WS] Connected')
        }

        ws.onclose = () => {
          setConnected(false)
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            reconnectAttempts++
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000)
            console.log(`[WS] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`)
            reconnectTimer.current = setTimeout(connect, delay)
          } else {
            console.error('[WS] Max reconnect attempts reached')
          }
        }

        ws.onerror = () => {
          try {
            ws.close()
          } catch {
            // ignore close errors
          }
        }

        ws.onmessage = (event) => {
          try {
            const msg: WSMessage = JSON.parse(event.data)
            if (msg.type !== 'ping') {
              enqueueMessage(msg)
            } else {
              if (ws.readyState === 1) {
                try {
                  ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }))
                } catch {
                  // ignore
                }
              }
            }
          } catch (err) {
            console.warn('[WS] Parse error:', err)
          }
        }
      } catch (err) {
        console.error('[WS] Connection error:', err)
      }
    }

    connect()

    return () => {
      if (reconnectTimer.current) {
        clearTimeout(reconnectTimer.current)
      }
      if (wsRef.current) {
        try {
          wsRef.current.close()
        } catch {
          // ignore
        }
      }
    }
  }, [enqueueMessage])

  return { connected }
}

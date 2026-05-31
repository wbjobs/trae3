import { useState, useCallback, useRef, useEffect } from 'react'
import { useDeviceStore } from '@/stores/deviceStore'
import { useAlertStore } from '@/stores/alertStore'
import { useConfigStore } from '@/stores/configStore'

const PING_INTERVAL = 30000
const PONG_TIMEOUT = 45000
const INITIAL_DELAY = 1000
const MAX_DELAY = 30000

interface ConnectionState {
  isConnected: boolean
  reconnectCount: number
  lastError: string | null
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting'
}

interface Subscription {
  type: string
  payload?: unknown
}

export function useWebSocket() {
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    isConnected: false,
    reconnectCount: 0,
    lastError: null,
    status: 'disconnected',
  })

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const pingTimerRef = useRef<ReturnType<typeof setInterval>>()
  const pongTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const messageQueueRef = useRef<unknown[]>([])
  const subscriptionsRef = useRef<Subscription[]>([])
  const reconnectAttemptsRef = useRef(0)

  const updateDeviceStatus = useDeviceStore((s) => s.updateDeviceStatus)
  const updateDeviceParams = useDeviceStore((s) => s.updateDeviceParams)
  const setGlobalConnectionStatus = useDeviceStore((s) => s.setConnectionStatus)
  const addAlert = useAlertStore((s) => s.addAlert)
  const updateProgress = useConfigStore((s) => s.updateProgress)

  const updateState = useCallback((updates: Partial<ConnectionState>) => {
    setConnectionState((prev) => ({ ...prev, ...updates }))
  }, [])

  const getBackoffDelay = useCallback((attempts: number) => {
    const delay = INITIAL_DELAY * Math.pow(2, attempts - 1)
    return Math.min(delay, MAX_DELAY)
  }, [])

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
    if (pingTimerRef.current) clearInterval(pingTimerRef.current)
    if (pongTimerRef.current) clearTimeout(pongTimerRef.current)
  }, [])

  const showNotification = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    addAlert({
      id: `ws-${Date.now()}`,
      deviceId: 'system',
      deviceName: '系统通知',
      level: type === 'error' ? 'warning' : 'info',
      type: 'connection',
      message,
      timestamp: Date.now(),
      acknowledged: false,
    })
  }, [addAlert])

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    } else {
      messageQueueRef.current.push(message)
    }
  }, [])

  const flushQueue = useCallback(() => {
    while (messageQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      const msg = messageQueueRef.current.shift()
      if (msg) wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const subscribe = useCallback((type: string, payload?: unknown) => {
    const subscription = { type, payload }
    subscriptionsRef.current.push(subscription)
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      send({ type: 'subscribe', data: payload })
    }
  }, [send])

  const restoreSubscriptions = useCallback(() => {
    subscriptionsRef.current.forEach((sub) => {
      send({ type: 'subscribe', data: sub.payload })
    })
  }, [send])

  const startPing = useCallback(() => {
    pingTimerRef.current = setInterval(() => {
      send({ type: 'ping' })
    }, PING_INTERVAL)
  }, [send])

  const resetPongTimer = useCallback(() => {
    if (pongTimerRef.current) clearTimeout(pongTimerRef.current)
    pongTimerRef.current = setTimeout(() => {
      wsRef.current?.close()
    }, PONG_TIMEOUT)
  }, [])

  const connect = useCallback(() => {
    const ws = new WebSocket('ws://localhost:3001/ws')
    wsRef.current = ws

    const status = reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting'
    updateState({ status, lastError: null })
    setGlobalConnectionStatus(status, reconnectAttemptsRef.current)

    ws.onopen = () => {
      const wasReconnecting = reconnectAttemptsRef.current > 0
      reconnectAttemptsRef.current = 0
      updateState({
        isConnected: true,
        reconnectCount: 0,
        status: 'connected',
        lastError: null,
      })
      setGlobalConnectionStatus('connected', 0)
      startPing()
      resetPongTimer()
      flushQueue()
      restoreSubscriptions()
      if (wasReconnecting) {
        showNotification('success', 'WebSocket 连接已恢复')
      }
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'ping') {
          send({ type: 'pong' })
          return
        }
        if (msg.type === 'pong') {
          resetPongTimer()
          return
        }
        resetPongTimer()
        switch (msg.event) {
          case 'device:status':
            updateDeviceStatus(msg.data.deviceId, msg.data.status)
            break
          case 'device:params':
            if (Array.isArray(msg.data)) {
              msg.data.forEach((item: { deviceId: string; params: Record<string, number> }) => {
                updateDeviceParams(item.deviceId, item.params)
              })
            } else {
              updateDeviceParams(msg.data.deviceId, msg.data.params)
            }
            break
          case 'device:alert':
            addAlert(msg.data)
            break
          case 'config:progress':
            updateProgress(msg.data.deviceId, msg.data.status)
            break
        }
      } catch {}
    }

    ws.onclose = () => {
      clearTimers()
      updateState({
        isConnected: false,
        status: 'disconnected',
      })
      setGlobalConnectionStatus('disconnected')
      const delay = getBackoffDelay(reconnectAttemptsRef.current + 1)
      reconnectAttemptsRef.current++
      updateState({
        reconnectCount: reconnectAttemptsRef.current,
        status: 'reconnecting',
      })
      setGlobalConnectionStatus('reconnecting', reconnectAttemptsRef.current)
      if (reconnectAttemptsRef.current === 1) {
        showNotification('error', `WebSocket 连接断开，${delay / 1000}s 后重试...`)
      }
      reconnectTimerRef.current = setTimeout(connect, delay)
    }

    ws.onerror = () => {
      updateState({ lastError: 'WebSocket 连接错误' })
      ws.close()
    }
  }, [updateState, startPing, resetPongTimer, flushQueue, restoreSubscriptions, clearTimers, getBackoffDelay, send, updateDeviceStatus, updateDeviceParams, addAlert, updateProgress, setGlobalConnectionStatus, showNotification])

  const reconnect = useCallback(() => {
    clearTimers()
    reconnectAttemptsRef.current = 0
    if (wsRef.current) {
      wsRef.current.close()
    }
    connect()
  }, [clearTimers, connect])

  const disconnect = useCallback(() => {
    clearTimers()
    if (wsRef.current) {
      wsRef.current.close()
    }
    updateState({
      isConnected: false,
      status: 'disconnected',
      reconnectCount: 0,
    })
  }, [clearTimers, updateState])

  useEffect(() => {
    connect()
    return () => {
      clearTimers()
      wsRef.current?.close()
    }
  }, [connect, clearTimers])

  return {
    ...connectionState,
    reconnect,
    disconnect,
    send,
    subscribe,
  }
}

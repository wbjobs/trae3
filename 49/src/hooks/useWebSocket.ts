import { useEffect, useRef, useCallback, useState } from 'react'
import { usePipelineStore } from '@/store/usePipelineStore'
import type {
  WsMessage,
  RealtimeData,
  AlarmRecord,
  CollaborationUser,
  Annotation,
} from '../../shared/types'

type RealtimeDelta = (Partial<RealtimeData> & { pipeId: string; timestamp: number })[]

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

const THROTTLE_MS = 200

export function useWebSocket() {
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCursorSendRef = useRef(0)
  const lastCameraSendRef = useRef(0)

  const setRealtimeData = usePipelineStore((s) => s.setRealtimeData)
  const mergeRealtimeDelta = usePipelineStore((s) => s.mergeRealtimeDelta)
  const addAlarm = usePipelineStore((s) => s.addAlarm)
  const updateOnlineUserWithPartial = usePipelineStore((s) => s.updateOnlineUserWithPartial)
  const removeOnlineUser = usePipelineStore((s) => s.removeOnlineUser)
  const setOnlineUsers = usePipelineStore((s) => s.setOnlineUsers)
  const addAnnotation = usePipelineStore((s) => s.addAnnotation)
  const setCurrentUser = usePipelineStore((s) => s.setCurrentUser)
  const currentUser = usePipelineStore((s) => s.currentUser)

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const msg: WsMessage = JSON.parse(event.data)
        switch (msg.event) {
          case 'realtime:update':
            setRealtimeData(msg.data as RealtimeData | RealtimeData[])
            break
          case 'realtime:delta':
            mergeRealtimeDelta(msg.data as RealtimeDelta)
            break
          case 'alarm:new':
            addAlarm(msg.data as AlarmRecord)
            break
          case 'collab:join': {
            const data = msg.data as {
              self?: CollaborationUser
              users?: CollaborationUser[]
              user?: CollaborationUser
            }
            if (data.self) {
              setOnlineUsers(data.users || [])
              setCurrentUser(data.self)
            } else if (data.user) {
              setOnlineUsers([
                ...usePipelineStore.getState().onlineUsers,
                data.user,
              ])
            }
            break
          }
          case 'collab:leave': {
            const leaving = msg.data as { userId: string }
            removeOnlineUser(leaving.userId)
            break
          }
          case 'collab:cursor': {
            const data = msg.data as { userId: string; cursor: { x: number; y: number; z: number } }
            updateOnlineUserWithPartial(data.userId, { cursor: data.cursor })
            break
          }
          case 'collab:camera': {
            const data = msg.data as {
              userId: string
              position: { x: number; y: number; z: number }
              target: { x: number; y: number; z: number }
            }
            updateOnlineUserWithPartial(data.userId, {
              cameraPosition: data.position,
              cameraTarget: data.target,
            })
            break
          }
          case 'collab:annotation':
            addAnnotation(msg.data as Annotation)
            break
        }
      } catch {
      }
    },
    [setRealtimeData, mergeRealtimeDelta, addAlarm, removeOnlineUser, setOnlineUsers, addAnnotation, setCurrentUser]
  )

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return

    const ws = new WebSocket(getWsUrl())
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      if (currentUser) {
        ws.send(JSON.stringify({
          event: 'collab:join',
          data: { name: currentUser.name, role: currentUser.role },
        }))
      }
    }

    ws.onclose = () => {
      setConnected(false)
      reconnectTimerRef.current = setTimeout(connect, 3000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = handleMessage
  }, [handleMessage, currentUser])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((msg: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const sendCursor = useCallback(
    (position: { x: number; y: number; z: number }) => {
      const now = Date.now()
      if (now - lastCursorSendRef.current < THROTTLE_MS) return
      if (!currentUser) return
      lastCursorSendRef.current = now
      send({
        event: 'collab:cursor',
        data: { userId: currentUser.id, cursor: position },
      })
    },
    [send, currentUser]
  )

  const sendCamera = useCallback(
    (position: { x: number; y: number; z: number }, target: { x: number; y: number; z: number }) => {
      const now = Date.now()
      if (now - lastCameraSendRef.current < THROTTLE_MS) return
      if (!currentUser) return
      lastCameraSendRef.current = now
      send({
        event: 'collab:camera',
        data: { userId: currentUser.id, position, target },
      })
    },
    [send, currentUser]
  )

  const sendAnnotation = useCallback(
    (annotation: Annotation) => {
      send({ event: 'collab:annotation', data: annotation })
    },
    [send]
  )

  return { connected, sendCursor, sendCamera, sendAnnotation }
}

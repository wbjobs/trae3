import { useEffect, useRef, useCallback, useState } from 'react'
import { message } from 'antd'

interface CollaborationEvent {
  type: string
  specimenId: number
  imageId?: number
  action: string
  userId: number
  username: string
  timestamp: number
}

export const useCollaboration = (tenantId: number | null) => {
  const [onlineUsers] = useState<number[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval>>()

  const connect = useCallback(() => {
    if (!tenantId) return

    const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws/collaboration`
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      wsRef.current = ws
      heartbeatRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'HEARTBEAT', tenantId }))
        }
      }, 30000)
    }

    ws.onmessage = (event) => {
      try {
        const data: CollaborationEvent = JSON.parse(event.data)
        if (data.type === 'ANNOTATION_CHANGE' || data.type === 'SPECIMEN_CHANGE') {
          const actionMap: Record<string, string> = {
            CREATE: '创建了标注',
            BATCH_CREATE: '批量创建了标注',
            DELETE: '删除了标注',
            UPDATE: '更新了标本'
          }
          const actionText = actionMap[data.action] || data.action
          message.info(`${data.username} ${actionText}`)
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onclose = () => {
      wsRef.current = null
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }
      setTimeout(connect, 5000)
    }

    ws.onerror = () => {
      ws.close()
    }
  }, [tenantId])

  useEffect(() => {
    connect()
    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
      if (heartbeatRef.current) {
        clearInterval(heartbeatRef.current)
      }
    }
  }, [connect])

  return { onlineUsers }
}

export default useCollaboration

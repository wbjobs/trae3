import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import { v4 as uuid } from 'uuid'
import { getAllRealtimeData, getChangedData } from './realtime-cache.js'
import type { CollaborationUser, WsMessage, RealtimeData, AlarmRecord, Annotation, WsDeltaMessage } from '../shared/types.js'

interface ConnectionState {
  ws: WebSocket
  user: CollaborationUser
  lastSent: Map<string, RealtimeData>
  messageQueue: string[]
  messageTimestamps: number[]
  deltaTimer: ReturnType<typeof setInterval> | null
  fullTimer: ReturnType<typeof setInterval> | null
}

const connectedUsers = new Map<string, ConnectionState>()
let wss: WebSocketServer

const USER_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
]

const MAX_MESSAGES_PER_SECOND = 10
const DELTA_INTERVAL = 1000
const FULL_UPDATE_INTERVAL = 5000

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket) => {
    let userId: string | null = null
    const state: Partial<ConnectionState> = {
      ws,
      lastSent: new Map(),
      messageQueue: [],
      messageTimestamps: [],
      deltaTimer: null,
      fullTimer: null,
    }

    ws.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as WsMessage
        handleClientMessage(ws, msg, (id) => {
          userId = id
          state.user = connectedUsers.get(id)!.user
        })
      } catch {
        // ignore malformed messages
      }
    })

    ws.on('close', () => {
      if (userId && connectedUsers.has(userId)) {
        const leaving = connectedUsers.get(userId)!
        if (leaving.deltaTimer) clearInterval(leaving.deltaTimer)
        if (leaving.fullTimer) clearInterval(leaving.fullTimer)
        connectedUsers.delete(userId)
        broadcast({
          event: 'collab:leave',
          data: { userId },
        }, leaving.user.id)
      }
    })
  })
}

function startClientBroadcasts(userId: string): void {
  const state = connectedUsers.get(userId)
  if (!state) return

  sendFullSnapshot(userId)

  state.deltaTimer = setInterval(() => {
    sendDeltaUpdate(userId)
  }, DELTA_INTERVAL)

  state.fullTimer = setInterval(() => {
    sendFullSnapshot(userId)
  }, FULL_UPDATE_INTERVAL)
}

function sendFullSnapshot(userId: string): void {
  const state = connectedUsers.get(userId)
  if (!state || state.ws.readyState !== WebSocket.OPEN) return

  const allData = getAllRealtimeData()
  const msg: WsMessage<RealtimeData[]> = {
    event: 'realtime:update',
    data: allData,
  }

  state.lastSent = new Map(allData.map(d => [d.pipeId, { ...d }]))
  sendToClient(userId, JSON.stringify(msg))
}

function sendDeltaUpdate(userId: string): void {
  const state = connectedUsers.get(userId)
  if (!state || state.ws.readyState !== WebSocket.OPEN) return

  const changes = getChangedData(state.lastSent)
  if (changes.length === 0) return

  const msg: WsDeltaMessage = {
    event: 'realtime:delta',
    data: changes,
  }

  const allData = getAllRealtimeData()
  for (const d of allData) {
    state.lastSent.set(d.pipeId, { ...d })
  }

  sendToClient(userId, JSON.stringify(msg))
}

function sendToClient(userId: string, message: string): void {
  const state = connectedUsers.get(userId)
  if (!state) return

  const now = Date.now()
  state.messageTimestamps = state.messageTimestamps.filter(t => now - t < 1000)

  if (state.messageTimestamps.length < MAX_MESSAGES_PER_SECOND) {
    if (state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(message)
      state.messageTimestamps.push(now)
    }
  } else {
    state.messageQueue.push(message)
    if (state.messageQueue.length > 100) {
      state.messageQueue.shift()
    }
  }

  processQueue(userId)
}

function processQueue(userId: string): void {
  const state = connectedUsers.get(userId)
  if (!state) return

  const now = Date.now()
  state.messageTimestamps = state.messageTimestamps.filter(t => now - t < 1000)

  while (state.messageQueue.length > 0 && state.messageTimestamps.length < MAX_MESSAGES_PER_SECOND) {
    const msg = state.messageQueue.shift()!
    if (state.ws.readyState === WebSocket.OPEN) {
      state.ws.send(msg)
      state.messageTimestamps.push(now)
    }
  }
}

function handleClientMessage(ws: WebSocket, msg: WsMessage, setUserId: (id: string) => void): void {
  switch (msg.event) {
    case 'collab:join': {
      const user = msg.data as Omit<CollaborationUser, 'id' | 'color'>
      const id = uuid()
      const color = USER_COLORS[connectedUsers.size % USER_COLORS.length]
      const fullUser: CollaborationUser = {
        ...user,
        id,
        color,
      }

      const existingState = connectedUsers.get(id) || {
        ws,
        user: fullUser,
        lastSent: new Map(),
        messageQueue: [],
        messageTimestamps: [],
        deltaTimer: null,
        fullTimer: null,
      }
      existingState.user = fullUser
      existingState.ws = ws

      connectedUsers.set(id, existingState)
      setUserId(id)

      startClientBroadcasts(id)

      const response: WsMessage = {
        event: 'collab:join',
        data: {
          self: fullUser,
          users: getOnlineUsers().filter((u) => u.id !== id),
        },
      }
      sendToClient(id, JSON.stringify(response))

      broadcast({
        event: 'collab:join',
        data: { user: fullUser },
      }, id)
      break
    }
    case 'collab:cursor': {
      const cursorMsg = msg.data as { userId: string; cursor: { x: number; y: number; z: number } }
      const entry = connectedUsers.get(cursorMsg.userId)
      if (entry) {
        entry.user.cursor = cursorMsg.cursor
        broadcast({
          event: 'collab:cursor',
          data: {
            userId: cursorMsg.userId,
            cursor: cursorMsg.cursor,
          },
        }, cursorMsg.userId)
      }
      break
    }
    case 'collab:camera': {
      const cameraMsg = msg.data as { userId: string; position: { x: number; y: number; z: number }; target: { x: number; y: number; z: number } }
      const entry = connectedUsers.get(cameraMsg.userId)
      if (entry) {
        entry.user.cameraPosition = cameraMsg.position
        entry.user.cameraTarget = cameraMsg.target
        broadcast({
          event: 'collab:camera',
          data: {
            userId: cameraMsg.userId,
            position: cameraMsg.position,
            target: cameraMsg.target,
          },
        }, cameraMsg.userId)
      }
      break
    }
    case 'collab:annotation': {
      broadcast({
        event: 'collab:annotation',
        data: msg.data as Annotation,
      })
      break
    }
  }
}

function broadcast(message: WsMessage, excludeUserId?: string): void {
  const data = JSON.stringify(message)
  for (const [uid] of connectedUsers) {
    if (uid === excludeUserId) continue
    sendToClient(uid, data)
  }
}

export function broadcastAlarm(alarm: AlarmRecord): void {
  broadcast({
    event: 'alarm:new',
    data: alarm,
  })
}

export function getOnlineUsers(): CollaborationUser[] {
  return Array.from(connectedUsers.values()).map((e) => e.user)
}

export function closeWebSocket(): void {
  for (const [, state] of connectedUsers) {
    if (state.deltaTimer) clearInterval(state.deltaTimer)
    if (state.fullTimer) clearInterval(state.fullTimer)
    state.ws.close()
  }
  connectedUsers.clear()
  if (wss) {
    wss.close()
  }
}

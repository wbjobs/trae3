import type { WebSocket, WebSocketServer } from 'ws'
import type { IncomingMessage } from 'http'

const clients = new Map<WebSocket, { createdAt: number; lastPing: number }>()
const messageQueue: { data: string; timestamp: number }[] = []
const MAX_QUEUE_SIZE = 100
const HEARTBEAT_INTERVAL = 30000
const CLIENT_TIMEOUT = 60000

let heartbeatTimer: ReturnType<typeof setInterval> | null = null

function enqueueMessage(message: object) {
  try {
    const data = JSON.stringify(message)
    messageQueue.push({ data, timestamp: Date.now() })
    if (messageQueue.length > MAX_QUEUE_SIZE) {
      messageQueue.shift()
    }
    return data
  } catch {
    return null
  }
}

function sendToClient(client: WebSocket, data: string): boolean {
  try {
    if (client.readyState === 1) {
      client.send(data, { binary: false }, (err) => {
        if (err) {
          console.warn('[WS] Failed to send to client:', err.message)
          clients.delete(client)
          try { client.close() } catch {}
        }
      })
      return true
    }
    return false
  } catch {
    clients.delete(client)
    return false
  }
}

function cleanupStaleClients() {
  const now = Date.now()
  for (const [client, info] of clients) {
    if (now - info.lastPing > CLIENT_TIMEOUT) {
      try { client.close() } catch {}
      clients.delete(client)
    }
  }
}

function startHeartbeat() {
  if (heartbeatTimer) return
  heartbeatTimer = setInterval(() => {
    cleanupStaleClients()
    const pingMessage = JSON.stringify({ type: 'ping', timestamp: Date.now() })
    for (const [client, info] of clients) {
      if (sendToClient(client, pingMessage)) {
        info.lastPing = Date.now()
      }
    }
  }, HEARTBEAT_INTERVAL)
}

export function setupWebSocket(wss: WebSocketServer) {
  startHeartbeat()

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    clients.set(ws, { createdAt: Date.now(), lastPing: Date.now() })

    const clientInfo = {
      type: 'connection',
      connectedClients: clients.size,
      timestamp: Date.now(),
    }
    sendToClient(ws, JSON.stringify(clientInfo))

    if (messageQueue.length > 0) {
      const recentMsgs = messageQueue.slice(-20)
      recentMsgs.forEach((msg) => sendToClient(ws, msg.data))
    }

    ws.on('message', (rawData) => {
      try {
        const data = JSON.parse(rawData.toString())
        if (data.type === 'pong') {
          const info = clients.get(ws)
          if (info) info.lastPing = Date.now()
        }
      } catch {}
    })

    ws.on('close', () => {
      clients.delete(ws)
    })

    ws.on('error', (err) => {
      console.warn('[WS] Client error:', err.message)
      clients.delete(ws)
      try { ws.close() } catch {}
    })
  })

  wss.on('close', () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  })
}

export function broadcastToClients(message: object) {
  const data = enqueueMessage(message)
  if (!data) return

  let successCount = 0
  let failCount = 0

  for (const client of clients.keys()) {
    if (sendToClient(client, data)) {
      successCount++
    } else {
      failCount++
    }
  }

  if (failCount > 0) {
    console.warn(`[WS] Broadcast: ${successCount} sent, ${failCount} failed`)
  }
}

export function getConnectedClientCount() {
  return clients.size
}

export function getQueueSize() {
  return messageQueue.length
}

export function flushQueue() {
  messageQueue.length = 0
}

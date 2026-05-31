import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'

interface ClientInfo {
  id: string
  connectedAt: number
  lastPong: number
  subscriptions: Set<string>
}

const subscriptions = new Map<string, Set<WebSocket>>()
const clientInfo = new Map<WebSocket, ClientInfo>()

let wss: WebSocketServer
let clientIdCounter = 0

function init(server: Server) {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    const clientId = `client_${++clientIdCounter}_${Date.now()}`
    const info: ClientInfo = {
      id: clientId,
      connectedAt: Date.now(),
      lastPong: Date.now(),
      subscriptions: new Set()
    }
    clientInfo.set(ws, info)
    ;(ws as any).isAlive = true

    const pingInterval = setInterval(() => {
      if ((ws as any).isAlive === false) {
        clearInterval(pingInterval)
        cleanupClient(ws)
        ws.terminate()
        return
      }
      ;(ws as any).isAlive = false
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }))
      const pongTimeout = setTimeout(() => {
        cleanupClient(ws)
        ws.terminate()
      }, 90000)
      ;(ws as any).pongTimeout = pongTimeout
    }, 30000)
    ;(ws as any).pingInterval = pingInterval

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'pong') {
          ;(ws as any).isAlive = true
          const info = clientInfo.get(ws)
          if (info) {
            info.lastPong = Date.now()
          }
          if ((ws as any).pongTimeout) {
            clearTimeout((ws as any).pongTimeout)
          }
          return
        }
        if (msg.type === 'subscribe:device' && msg.deviceId) {
          if (!subscriptions.has(msg.deviceId)) {
            subscriptions.set(msg.deviceId, new Set())
          }
          subscriptions.get(msg.deviceId)!.add(ws)
          const info = clientInfo.get(ws)
          if (info) {
            info.subscriptions.add(msg.deviceId)
          }
        }
        if (msg.type === 'unsubscribe:device' && msg.deviceId) {
          subscriptions.get(msg.deviceId)?.delete(ws)
          const info = clientInfo.get(ws)
          if (info) {
            info.subscriptions.delete(msg.deviceId)
          }
        }
      } catch {}
    })

    ws.on('close', () => {
      clearInterval(pingInterval)
      if ((ws as any).pongTimeout) {
        clearTimeout((ws as any).pongTimeout)
      }
      cleanupClient(ws)
    })
  })
}

function cleanupClient(ws: WebSocket) {
  const info = clientInfo.get(ws)
  if (info) {
    for (const deviceId of info.subscriptions) {
      subscriptions.get(deviceId)?.delete(ws)
    }
  }
  clientInfo.delete(ws)
}

function getClientCount() {
  return clientInfo.size
}

function getClientStatus() {
  const status = []
  for (const [ws, info] of clientInfo) {
    status.push({
      id: info.id,
      connectedAt: info.connectedAt,
      lastPong: info.lastPong,
      subscriptions: Array.from(info.subscriptions),
      readyState: ws.readyState
    })
  }
  return status
}

function broadcast(event: string, data: unknown) {
  if (!wss) return
  const message = JSON.stringify({ event, data, timestamp: Date.now() })
  for (const client of wss.clients) {
    if ((client as any).isAlive && client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  }
}

function broadcastToDevice(deviceId: string, event: string, data: unknown) {
  const message = JSON.stringify({ event, data, timestamp: Date.now() })
  const subs = subscriptions.get(deviceId)
  if (subs) {
    for (const client of subs) {
      if ((client as any).isAlive && client.readyState === WebSocket.OPEN) {
        client.send(message)
      }
    }
  }
}

export { init, broadcast, broadcastToDevice, wss, getClientCount, getClientStatus }

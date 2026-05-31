import { WebSocketServer, WebSocket } from 'ws'
import type { Server } from 'http'
import type { WSMessage } from '../shared/types.js'

let wss: WebSocketServer | null = null

export function setupWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' })

  wss.on('connection', (ws: WebSocket) => {
    console.log('WebSocket client connected')

    ws.on('close', () => {
      console.log('WebSocket client disconnected')
    })

    ws.on('error', (err: Error) => {
      console.error('WebSocket error:', err.message)
    })
  })
}

export function broadcastMessage(msg: WSMessage): void {
  if (!wss) return

  const data = JSON.stringify(msg)
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data)
    }
  }
}

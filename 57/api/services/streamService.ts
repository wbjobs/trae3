import type { Response } from 'express'
import { hotDataStore } from './hotDataCache.js'

const clients: Set<Response> = new Set()

let heartbeatInterval: ReturnType<typeof setInterval> | null = null

function ensureHeartbeat(): void {
  if (heartbeatInterval) return
  heartbeatInterval = setInterval(() => {
    broadcastToClients('heartbeat', { timestamp: new Date().toISOString() })
  }, 15000)
}

export function createSSEStream(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  res.flushHeaders()

  clients.add(res)

  const initialData = hotDataStore.getAllLatest(50)
  res.write(`event: initial\ndata: ${JSON.stringify(initialData)}\n\n`)

  ensureHeartbeat()

  res.on('close', () => {
    clients.delete(res)
    if (clients.size === 0 && heartbeatInterval) {
      clearInterval(heartbeatInterval)
      heartbeatInterval = null
    }
  })
}

export function broadcastToClients(event: string, data: unknown): void {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of clients) {
    try {
      client.write(payload)
    } catch {
      clients.delete(client)
    }
  }
}

export function getConnectedClientCount(): number {
  return clients.size
}

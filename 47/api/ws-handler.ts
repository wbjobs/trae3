import type { WebSocket } from 'ws'
import type { WSMessageType, WSMessage } from '../shared/types.js'
import { ARRAY_IDS } from '../shared/types.js'
import { getKpi, getDevices, getLatestData } from './db.js'

const clients = new Set<WebSocket>()

export function handleConnection(ws: WebSocket): void {
  clients.add(ws)
  console.log(`WebSocket client connected, total: ${clients.size}`)

  const kpi = getKpi()
  const devices = getDevices()
  const latestData: Record<string, unknown> = {}
  for (const id of ARRAY_IDS) {
    const d = getLatestData(id)
    if (d) latestData[id] = d
  }

  const kpiMsg = {
    type: 'metric_update' as const,
    timestamp: Date.now(),
    payload: kpi,
  }
  ws.send(JSON.stringify(kpiMsg))

  const devMsg = {
    type: 'device_status' as const,
    timestamp: Date.now(),
    payload: devices,
  }
  ws.send(JSON.stringify(devMsg))

  for (const [id, data] of Object.entries(latestData)) {
    const dataMsg = {
      type: 'realtime_data' as const,
      timestamp: Date.now(),
      payload: data,
    }
    ws.send(JSON.stringify(dataMsg))
  }

  ws.on('close', () => {
    clients.delete(ws)
    console.log(`WebSocket client disconnected, total: ${clients.size}`)
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message)
    clients.delete(ws)
  })
}

export function broadcastMessage(type: WSMessageType, payload: unknown): void {
  const message: WSMessage = {
    type,
    timestamp: Date.now(),
    payload: payload as WSMessage['payload'],
  }
  const data = JSON.stringify(message)
  for (const client of clients) {
    if (client.readyState === 1) {
      client.send(data)
    }
  }
}

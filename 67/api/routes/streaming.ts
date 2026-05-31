import { Router, type Request, type Response } from 'express'
import { streamingService } from '../services/streamingService.js'
import { store } from '../db/store.js'
import type { SSEMessage, AnomalyRecord, WindowAggregate, HealthSummary } from '../../shared/types.js'

interface SSEClient {
  id: string
  res: Response
  lastEventId: string | null
  connectedAt: number
}

const router = Router()

const clients = new Map<string, SSEClient>()
let messageIdCounter = 0
let anomalyQueue: AnomalyRecord[] = []

const METRIC_BATCH_INTERVAL_MS = 3000
const HEALTH_UPDATE_INTERVAL_MS = 15000

let metricBatchInterval: ReturnType<typeof setInterval> | null = null
let healthUpdateInterval: ReturnType<typeof setInterval> | null = null

function generateMessageId(): string {
  return `msg-${++messageIdCounter}-${Date.now()}`
}

function formatSSE(event: string, data: unknown, id?: string): string {
  const msgId = id || generateMessageId()
  return `id: ${msgId}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function sendToClient(client: SSEClient, message: SSEMessage): void {
  const sseData = formatSSE(message.type, message.data, message.id)
  client.res.write(sseData)
  client.lastEventId = message.id
}

function broadcastMessage(message: SSEMessage): void {
  for (const client of clients.values()) {
    sendToClient(client, message)
  }
}

function startMetricBatchPublishing(): void {
  if (metricBatchInterval) return
  metricBatchInterval = setInterval(() => {
    const windows = streamingService.getWindowAggregates()
    if (windows.length > 0) {
      const message: SSEMessage = {
        type: 'metric_batch',
        id: generateMessageId(),
        data: { windows: windows as unknown as WindowAggregate[] },
        timestamp: new Date().toISOString(),
      }
      broadcastMessage(message)
    }
  }, METRIC_BATCH_INTERVAL_MS)
}

function startHealthUpdatePublishing(): void {
  if (healthUpdateInterval) return
  healthUpdateInterval = setInterval(() => {
    const health = store.getHealthSummary()
    const message: SSEMessage = {
      type: 'health_update',
      id: generateMessageId(),
      data: { health: health as unknown as HealthSummary[] },
      timestamp: new Date().toISOString(),
    }
    broadcastMessage(message)
  }, HEALTH_UPDATE_INTERVAL_MS)
}

function queueAnomaly(anomaly: AnomalyRecord): void {
  anomalyQueue.push(anomaly)
  const message: SSEMessage = {
    type: 'anomaly_event',
    id: generateMessageId(),
    data: { anomaly },
    timestamp: new Date().toISOString(),
  }
  broadcastMessage(message)
}

router.get('/', (req: Request, res: Response): void => {
  const clientId = `client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  const lastEventId = req.headers['last-event-id'] as string | null

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'X-Accel-Buffering': 'no',
  })

  res.write('\n')

  const client: SSEClient = {
    id: clientId,
    res,
    lastEventId,
    connectedAt: Date.now(),
  }

  clients.set(clientId, client)

  if (clients.size === 1) {
    startMetricBatchPublishing()
    startHealthUpdatePublishing()
  }

  const welcomeMessage: SSEMessage = {
    type: 'health_update',
    id: generateMessageId(),
    data: { connected: true, clientId, connectedClients: clients.size },
    timestamp: new Date().toISOString(),
  }
  sendToClient(client, welcomeMessage)

  const initialHealth = store.getHealthSummary()
  const healthMessage: SSEMessage = {
    type: 'health_update',
    id: generateMessageId(),
    data: { health: initialHealth as unknown as HealthSummary[] },
    timestamp: new Date().toISOString(),
  }
  sendToClient(client, healthMessage)

  req.on('close', () => {
    clients.delete(clientId)
    if (clients.size === 0) {
      if (metricBatchInterval) {
        clearInterval(metricBatchInterval)
        metricBatchInterval = null
      }
      if (healthUpdateInterval) {
        clearInterval(healthUpdateInterval)
        healthUpdateInterval = null
      }
    }
  })

  req.on('error', (err) => {
    console.error('SSE client error:', err.message)
    clients.delete(clientId)
  })
})

router.get('/stats', (_req: Request, res: Response): void => {
  res.json({
    connectedClients: clients.size,
    messageIdCounter,
    anomalyQueueSize: anomalyQueue.length,
    metricBatchActive: metricBatchInterval !== null,
    healthUpdateActive: healthUpdateInterval !== null,
  })
})

export function notifyNewAnomaly(anomaly: AnomalyRecord): void {
  queueAnomaly(anomaly)
}

export default router

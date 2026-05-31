import { processDataPoint } from './services/calculationService.js'
import { broadcastMessage } from './websocket.js'
import { store } from './db/store.js'
import type { DataPoint, MetricType, WSMessage } from '../shared/types.js'

const METRIC_TYPES: MetricType[] = ['cpu', 'memory', 'disk', 'network']

const METRIC_BASES: Record<MetricType, number> = {
  cpu: 45,
  memory: 58,
  disk: 45,
  network: 30,
}

const METRIC_SWINGS: Record<MetricType, number> = {
  cpu: 20,
  memory: 12,
  disk: 10,
  network: 15,
}

let intervalId: ReturnType<typeof setInterval> | null = null
let tickCount = 0

export function startSimulator(): void {
  if (intervalId) return

  intervalId = setInterval(() => {
    tickCount++
    const services = store.getServices()

    for (const svc of services) {
      for (const node of svc.nodes) {
        for (const metricType of METRIC_TYPES) {
          const base = METRIC_BASES[metricType]
          const swing = METRIC_SWINGS[metricType]

          let value: number
          if (Math.random() < 0.1) {
            value = base + swing + Math.random() * 40 + 20
          } else {
            const sinComponent = Math.sin(tickCount * 0.05 + METRIC_TYPES.indexOf(metricType)) * swing * 0.5
            value = base + sinComponent + (Math.random() - 0.5) * swing
          }

          value = Math.max(0, Math.min(100, Math.round(value * 100) / 100))

          const dp: DataPoint = {
            metricType,
            serviceName: svc.name,
            nodeId: node.id,
            value,
          }

          const result = processDataPoint(dp)

          const wsMsg: WSMessage = {
            type: 'metric_update',
            payload: { timestamp: new Date().toISOString(), value },
          }
          broadcastMessage(wsMsg)

          for (const anomaly of result.detectionResult.newAnomalies) {
            broadcastMessage({ type: 'anomaly_detected', payload: anomaly })
          }

          for (const anomaly of result.detectionResult.resolvedAnomalies) {
            broadcastMessage({ type: 'anomaly_resolved', payload: anomaly })
          }
        }
      }
    }
  }, 3000)
}

export function stopSimulator(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

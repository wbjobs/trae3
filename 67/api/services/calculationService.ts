import { store } from '../db/store.js'
import { detect, type DetectionResult } from './detectionService.js'
import { streamingService } from './streamingService.js'
import { notifyNewAnomaly } from '../routes/streaming.js'
import type { DataPoint } from '../../shared/types.js'

export interface CalculationResult {
  detectionResult: DetectionResult
}

export function processDataPoint(dp: DataPoint): CalculationResult {
  const timestamp = dp.timestamp || new Date().toISOString()

  store.insertMetric(dp.metricType, dp.serviceName, dp.nodeId, dp.value, timestamp)

  streamingService.processPoint({ ...dp, timestamp })

  const detectionResult = detect(dp.metricType, dp.serviceName, dp.nodeId, dp.value, timestamp)

  for (const anomaly of detectionResult.newAnomalies) {
    streamingService.incrementAnomaliesDetected()
    notifyNewAnomaly(anomaly)
  }

  return { detectionResult }
}

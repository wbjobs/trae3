import { store } from '../db/store.js'
import type { MetricType, Severity, AnomalyRecord, AlertRule } from '../../shared/types.js'

const SEVERITY_ORDER: Record<Severity, number> = { low: 1, medium: 2, high: 3, critical: 4 }

const DESCRIPTIONS: Record<MetricType, string> = {
  cpu: 'CPU usage exceeded threshold',
  memory: 'Memory usage exceeded threshold',
  disk: 'Disk usage exceeded threshold',
  network: 'Network usage exceeded threshold',
}

const ROOT_CAUSES: Record<MetricType, string> = {
  cpu: 'Possible cause: high request volume, infinite loop, or resource-intensive process',
  memory: 'Possible cause: memory leak, large data loading, or insufficient memory allocation',
  disk: 'Possible cause: log accumulation, large file writes, or insufficient disk capacity',
  network: 'Possible cause: DDoS attack, large data transfer, or network misconfiguration',
}

const RELATED: Record<MetricType, MetricType[]> = {
  cpu: ['memory', 'network'],
  memory: ['cpu', 'disk'],
  disk: ['memory'],
  network: ['cpu'],
}

const TRIGGER_WINDOW_SIZE = 3
const RECOVER_WINDOW_SIZE = 5

interface WindowState {
  values: number[]
  triggerCount: number
  recoverCount: number
  currentSeverity: Severity | null
}

const windowStates = new Map<string, WindowState>()

function getWindowKey(metricType: MetricType, serviceName: string, nodeId: string): string {
  return `${metricType}:${serviceName}:${nodeId}`
}

function getOrCreateWindow(key: string): WindowState {
  if (!windowStates.has(key)) {
    windowStates.set(key, {
      values: [],
      triggerCount: 0,
      recoverCount: 0,
      currentSeverity: null,
    })
  }
  return windowStates.get(key)!
}

function updateWindow(window: WindowState, value: number, triggers: boolean, recovers: boolean): void {
  window.values.push(value)
  if (window.values.length > Math.max(TRIGGER_WINDOW_SIZE, RECOVER_WINDOW_SIZE)) {
    window.values.shift()
  }

  if (triggers) {
    window.triggerCount = Math.min(window.triggerCount + 1, TRIGGER_WINDOW_SIZE)
  } else {
    window.triggerCount = Math.max(window.triggerCount - 1, 0)
  }

  if (recovers) {
    window.recoverCount = Math.min(window.recoverCount + 1, RECOVER_WINDOW_SIZE)
  } else {
    window.recoverCount = Math.max(window.recoverCount - 1, 0)
  }
}

function shouldTrigger(window: WindowState): boolean {
  return window.triggerCount >= TRIGGER_WINDOW_SIZE
}

function shouldRecover(window: WindowState): boolean {
  return window.recoverCount >= RECOVER_WINDOW_SIZE
}

function calculateHysteresis(lowestThreshold: number, highestThreshold: number): number {
  const range = highestThreshold - lowestThreshold
  return Math.max(5, range * 0.3)
}

export interface DetectionResult {
  newAnomalies: AnomalyRecord[]
  resolvedAnomalies: AnomalyRecord[]
}

export function detect(
  metricType: MetricType,
  serviceName: string,
  nodeId: string,
  value: number,
  timestamp: string
): DetectionResult {
  const result: DetectionResult = { newAnomalies: [], resolvedAnomalies: [] }
  const windowKey = getWindowKey(metricType, serviceName, nodeId)
  const window = getOrCreateWindow(windowKey)

  const rules = store.getAlertRules().filter(r => r.metricType === metricType)
  if (rules.length === 0) return result

  const thresholds = rules.map(r => r.threshold).sort((a, b) => a - b)
  const lowestThreshold = thresholds[0]
  const highestThreshold = thresholds[thresholds.length - 1]
  const hysteresis = calculateHysteresis(lowestThreshold, highestThreshold)
  const recoverThreshold = lowestThreshold - hysteresis

  const activeAnomaly = store.findActiveAnomaly(metricType, serviceName, nodeId)
  const exceedsAnyThreshold = value > lowestThreshold
  const belowRecoverThreshold = value < recoverThreshold

  updateWindow(window, value, exceedsAnyThreshold, belowRecoverThreshold)

  let maxSeverity: Severity | null = null
  let maxThreshold = 0

  for (const rule of rules) {
    if (value > rule.threshold) {
      if (!maxSeverity || SEVERITY_ORDER[rule.severity] > SEVERITY_ORDER[maxSeverity]) {
        maxSeverity = rule.severity
        maxThreshold = rule.threshold
      }
    }
  }

  if (!activeAnomaly && maxSeverity && shouldTrigger(window)) {
    const anomaly = store.insertAnomaly({
      metricType,
      serviceName,
      nodeId,
      severity: maxSeverity,
      detectedAt: timestamp,
      recoveredAt: null,
      description: `${DESCRIPTIONS[metricType]} on ${nodeId} (${serviceName}): sustained ${value}% > threshold ${maxThreshold}% for ${TRIGGER_WINDOW_SIZE} consecutive points`,
      rootCauseHint: ROOT_CAUSES[metricType],
      relatedMetrics: RELATED[metricType],
    })
    result.newAnomalies.push(anomaly)
    window.currentSeverity = maxSeverity
    window.triggerCount = 0
  }

  if (activeAnomaly && (!maxSeverity || activeAnomaly.recoveredAt === null)) {
    if (shouldRecover(window) && !maxSeverity) {
      store.updateAnomaly(activeAnomaly.id, { recoveredAt: timestamp })
      const resolved = store.getAnomalyById(activeAnomaly.id)!
      result.resolvedAnomalies.push(resolved)
      window.currentSeverity = null
      window.recoverCount = 0
    } else if (maxSeverity && activeAnomaly.severity !== maxSeverity) {
      if (SEVERITY_ORDER[maxSeverity] > SEVERITY_ORDER[activeAnomaly.severity]) {
        store.updateAnomaly(activeAnomaly.id, { severity: maxSeverity })
        window.currentSeverity = maxSeverity
      }
    }
  }

  return result
}

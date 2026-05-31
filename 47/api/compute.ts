import type { PvDataPoint, AnomalyEvent, SlidingWindowMetrics } from '../shared/types.js'
import { ANOMALY_TYPES } from '../shared/types.js'

let eventCounter = 0

const cooldownMap = new Map<string, number>()
const COOLDOWN_MS = 60_000

function isInCooldown(arrayId: string, anomalyType: string): boolean {
  const key = `${arrayId}::${anomalyType}`
  const lastTime = cooldownMap.get(key) ?? 0
  return Date.now() - lastTime < COOLDOWN_MS
}

function markCooldown(arrayId: string, anomalyType: string): void {
  const key = `${arrayId}::${anomalyType}`
  cooldownMap.set(key, Date.now())
}

export interface ComputedMetrics {
  efficiency: number
  powerDeviation: number
  irradianceRatio: number
}

export function computeMetrics(data: PvDataPoint[]): ComputedMetrics {
  if (data.length === 0) {
    return { efficiency: 0, powerDeviation: 0, irradianceRatio: 0 }
  }

  const avgEfficiency = data.reduce((s, d) => s + d.efficiency, 0) / data.length

  const avgPower = data.reduce((s, d) => s + d.power, 0) / data.length
  const latestPower = data[data.length - 1].power
  const powerDeviation = avgPower > 0 ? (latestPower - avgPower) / avgPower : 0

  const avgIrradiance = data.reduce((s, d) => s + d.irradiance, 0) / data.length
  const irradianceRatio = avgIrradiance > 0 ? latestPower / (avgIrradiance * 0.5) : 0

  return {
    efficiency: Math.round(avgEfficiency * 100) / 100,
    powerDeviation: Math.round(powerDeviation * 1000) / 1000,
    irradianceRatio: Math.round(irradianceRatio * 100) / 100,
  }
}

interface SlidingWindow {
  push(point: PvDataPoint): void
  getMetrics(): SlidingWindowMetrics
  getHistory(): PvDataPoint[]
}

export function createSlidingWindow(windowSize: number): SlidingWindow {
  const points: PvDataPoint[] = []
  let sumPower = 0
  let sumEfficiency = 0
  let maxPower = 0
  let minPower = Infinity

  function push(point: PvDataPoint): void {
    points.push(point)
    sumPower += point.power
    sumEfficiency += point.efficiency
    maxPower = Math.max(maxPower, point.power)
    minPower = Math.min(minPower, point.power)

    if (points.length > windowSize) {
      const removed = points.shift()!
      sumPower -= removed.power
      sumEfficiency -= removed.efficiency

      if (removed.power === maxPower || removed.power === minPower) {
        maxPower = Math.max(...points.map(p => p.power))
        minPower = Math.min(...points.map(p => p.power))
      }
    }
  }

  function getHistory(): PvDataPoint[] {
    return [...points]
  }

  function getMetrics(): SlidingWindowMetrics {
    const count = points.length
    if (count === 0) {
      return {
        windowStart: 0,
        windowEnd: 0,
        points: 0,
        avgPower: 0,
        maxPower: 0,
        minPower: 0,
        avgEfficiency: 0,
        powerTrend: 0,
      }
    }

    const n = Math.min(3, count)
    const firstPoints = points.slice(0, n)
    const lastPoints = points.slice(-n)

    const firstAvg = firstPoints.reduce((s, p) => s + p.power, 0) / n
    const lastAvg = lastPoints.reduce((s, p) => s + p.power, 0) / n

    const powerTrend = firstAvg > 0 ? (lastAvg - firstAvg) / firstAvg : 0

    return {
      windowStart: points[0].timestamp,
      windowEnd: points[count - 1].timestamp,
      points: count,
      avgPower: Math.round((sumPower / count) * 100) / 100,
      maxPower: Math.round(maxPower * 100) / 100,
      minPower: Math.round((minPower === Infinity ? 0 : minPower) * 100) / 100,
      avgEfficiency: Math.round((sumEfficiency / count) * 100) / 100,
      powerTrend: Math.round(powerTrend * 1000) / 1000,
    }
  }

  return { push, getMetrics, getHistory }
}

const MIN_POWER_FOR_DETECTION = 10
const MIN_IRRADIANCE_FOR_DETECTION = 50

export function detectAnomalies(
  data: PvDataPoint,
  windowHistory: PvDataPoint[]
): AnomalyEvent | null {
  const anomalies: { level: AnomalyEvent['level']; type: string; description: string; suggestion: string }[] = []

  const isGenerating = data.power > MIN_POWER_FOR_DETECTION && data.irradiance > MIN_IRRADIANCE_FOR_DETECTION

  if (isGenerating && data.efficiency < 14) {
    const def = ANOMALY_TYPES.find((a) => a.type === 'low_efficiency')!
    if (!isInCooldown(data.arrayId, def.type)) {
      anomalies.push({
        level: 'warning',
        type: def.type,
        description: `${data.arrayId} 效率 ${data.efficiency.toFixed(1)}% 低于阈值 14%`,
        suggestion: def.suggestion,
      })
    }
  }

  if (windowHistory.length >= 5 && isGenerating) {
    const windowPower = windowHistory.map(p => p.power)
    const avgPower = windowPower.reduce((a, b) => a + b, 0) / windowPower.length

    if (avgPower > MIN_POWER_FOR_DETECTION) {
      const drop = (avgPower - data.power) / avgPower
      if (drop > 0.3) {
        const def = ANOMALY_TYPES.find((a) => a.type === 'power_drop')!
        if (!isInCooldown(data.arrayId, def.type)) {
          anomalies.push({
            level: 'critical',
            type: def.type,
            description: `${data.arrayId} 功率骤降 ${(drop * 100).toFixed(1)}%（${avgPower.toFixed(1)}kW → ${data.power.toFixed(1)}kW）`,
            suggestion: def.suggestion,
          })
        }
      }
    }
  }

  if (data.temperature > 65) {
    const def = ANOMALY_TYPES.find((a) => a.type === 'over_temperature')!
    if (!isInCooldown(data.arrayId, def.type)) {
      anomalies.push({
        level: 'fault',
        type: def.type,
        description: `${data.arrayId} 温度 ${data.temperature.toFixed(1)}°C 超过安全阈值`,
        suggestion: def.suggestion,
      })
    }
  }

  if (isGenerating && (data.voltage < 450 || data.voltage > 850)) {
    const def = ANOMALY_TYPES.find((a) => a.type === 'voltage_anomaly')!
    if (!isInCooldown(data.arrayId, def.type)) {
      anomalies.push({
        level: 'warning',
        type: def.type,
        description: `${data.arrayId} 电压 ${data.voltage.toFixed(1)}V 偏离正常范围 (450-850V)`,
        suggestion: def.suggestion,
      })
    }
  }

  if (isGenerating && data.irradiance > 200) {
    const expectedPowerMin = data.irradiance * 0.3
    if (data.power < expectedPowerMin) {
      const def = ANOMALY_TYPES.find((a) => a.type === 'irradiance_mismatch')!
      if (!isInCooldown(data.arrayId, def.type)) {
        anomalies.push({
          level: 'warning',
          type: def.type,
          description: `${data.arrayId} 辐照度 ${data.irradiance.toFixed(0)}W/m² 下功率仅 ${data.power.toFixed(1)}kW，比例异常`,
          suggestion: def.suggestion,
        })
      }
    }
  }

  if (anomalies.length === 0) return null

  const primary = anomalies[0]
  markCooldown(data.arrayId, primary.type)
  eventCounter++

  return {
    id: `anomaly-${Date.now()}-${eventCounter}`,
    timestamp: data.timestamp,
    arrayId: data.arrayId,
    level: primary.level,
    type: primary.type,
    description: primary.description,
    metrics: {
      power: data.power,
      voltage: data.voltage,
      temperature: data.temperature,
      efficiency: data.efficiency,
      irradiance: data.irradiance,
    },
    suggestion: primary.suggestion,
  }
}

import * as deviceRepo from '../repositories/deviceRepository.js'
import * as alertRepo from '../repositories/alertRepository.js'
import type { Device, DeviceParam, TrendPoint, DashboardStats } from '../../shared/types.js'

const lastParamValues = new Map<string, number>()

function mapRowToDevice(row: deviceRepo.DeviceRow, params: DeviceParam[]): Device {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    type: row.type,
    floor: row.floor,
    position: { x: row.position_x, y: row.position_y, z: row.position_z },
    status: row.status,
    healthScore: row.health_score,
    params,
  }
}

function mapParamRow(row: deviceRepo.DeviceParamRow, changed: boolean = false): DeviceParam {
  return {
    key: row.param_key,
    label: row.label,
    value: row.value,
    unit: row.unit,
    threshold:
      row.threshold_min != null && row.threshold_max != null
        ? { min: row.threshold_min, max: row.threshold_max }
        : undefined,
    timestamp: new Date(row.timestamp).getTime(),
    changed,
  }
}

function listDevices(type?: string, floor?: number): Device[] {
  let rows: deviceRepo.DeviceRow[]
  if (type) {
    rows = deviceRepo.getByType(type)
  } else if (floor != null) {
    rows = deviceRepo.getByFloor(Number(floor))
  } else {
    rows = deviceRepo.getAll()
  }
  return rows.map((row) => {
    const paramRows = deviceRepo.getParamsByDeviceId(row.id)
    const params = paramRows.map((p) => mapParamRow(p))
    return mapRowToDevice(row, params)
  })
}

function getDevice(id: string): Device | null {
  const row = deviceRepo.getById(id)
  if (!row) return null
  const paramRows = deviceRepo.getParamsByDeviceId(row.id)
  const params = paramRows.map((p) => mapParamRow(p))
  return mapRowToDevice(row, params)
}

function getDeviceTrend(deviceId: string, key: string, hours: number): TrendPoint[] {
  return deviceRepo.getParamTrend(deviceId, key, hours)
}

function simulateDataUpdate(): { device: Device; params: DeviceParam[] }[] {
  const devices = deviceRepo.getAll()
  const results: { device: Device; params: DeviceParam[] }[] = []

  for (const device of devices) {
    const paramRows = deviceRepo.getParamsByDeviceId(device.id)
    const params = paramRows.map((p) => mapParamRow(p))
    const paramCount = Math.min(params.length, 1 + Math.floor(Math.random() * 2))
    const indices = [...Array(params.length).keys()]
      .sort(() => Math.random() - 0.5)
      .slice(0, paramCount)

    const changedParamKeys = new Set<string>()

    for (const i of indices) {
      const p = params[i]
      if (!p.threshold) continue

      const oldValue = p.value
      const { min, max } = p.threshold
      const range = max - min
      const variation = (Math.random() - 0.5) * range * 0.2
      p.value = Math.round((p.value + variation) * 100) / 100
      p.value = Math.max(min - range * 0.1, Math.min(max + range * 0.1, p.value))
      p.timestamp = Date.now()

      const paramKey = `${device.id}:${p.key}`
      const cachedValue = lastParamValues.get(paramKey)
      const hasSignificantChange =
        cachedValue === undefined || Math.abs(p.value - cachedValue) > range * 0.01

      if (hasSignificantChange) {
        p.changed = true
        changedParamKeys.add(p.key)
        lastParamValues.set(paramKey, p.value)
        deviceRepo.updateDeviceParam(device.id, p.key, p.value)
      } else {
        p.changed = false
        p.value = oldValue
      }
    }

    const rand = Math.random()
    let newStatus: Device['status']
    if (rand < 0.9) {
      newStatus = 'online'
    } else if (rand < 0.98) {
      newStatus = 'alarm'
    } else {
      newStatus = 'offline'
    }

    const statusChanged = newStatus !== device.status
    if (statusChanged) {
      device.status = newStatus
      deviceRepo.updateDeviceStatus(device.id, newStatus)
    }

    let totalScore = 0
    let scoreCount = 0
    for (const p of params) {
      if (!p.threshold) continue
      const { min, max } = p.threshold
      const center = (min + max) / 2
      const halfRange = (max - min) / 2
      if (p.value >= min && p.value <= max) {
        const deviation = halfRange > 0 ? Math.abs(p.value - center) / halfRange : 0
        totalScore += 100 - deviation * 30
      } else {
        const overshoot =
          halfRange > 0 ? (Math.abs(p.value - center) - halfRange) / halfRange : 1
        totalScore += Math.max(0, 70 - overshoot * 70)
      }
      scoreCount++
    }
    const healthScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 100
    device.health_score = healthScore
    deviceRepo.updateDeviceHealthScore(device.id, healthScore)

    if (statusChanged || changedParamKeys.size > 0) {
      results.push({ device: mapRowToDevice(device, params), params })
    }
  }

  return results
}

function getStats(): DashboardStats {
  const devices = deviceRepo.getAll()
  const activeCounts = alertRepo.getActiveCount()

  return {
    total: devices.length,
    online: devices.filter((d) => d.status === 'online').length,
    offline: devices.filter((d) => d.status === 'offline').length,
    alarm: devices.filter((d) => d.status === 'alarm').length,
    alertsByLevel: activeCounts,
  }
}

function getFloorStats(floor: string): DashboardStats {
  const devices = deviceRepo.getByFloor(Number(floor))
  return {
    total: devices.length,
    online: devices.filter((d) => d.status === 'online').length,
    offline: devices.filter((d) => d.status === 'offline').length,
    alarm: devices.filter((d) => d.status === 'alarm').length,
    alertsByLevel: { critical: 0, major: 0, minor: 0 },
  }
}

function cleanupOldTrendData(maxHours: number = 24) {
  deviceRepo.deleteOldTrendData(maxHours)
}

export default {
  listDevices,
  getDevice,
  getDeviceTrend,
  simulateDataUpdate,
  getStats,
  getFloorStats,
  cleanupOldTrendData,
}

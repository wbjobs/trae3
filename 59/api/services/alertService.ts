import * as alertRepo from '../repositories/alertRepository.js'
import * as deviceRepo from '../repositories/deviceRepository.js'
import type { Alert, AlertRule } from '../../shared/types.js'
import { v4 as uuidv4 } from 'uuid'
import { getDb } from '../database/schema.js'

function mapAlertRow(row: alertRepo.AlertRow): Alert {
  return {
    id: row.id,
    deviceId: row.device_id,
    deviceName: '',
    level: row.level,
    message: row.message,
    paramKey: row.param_key,
    paramValue: row.param_value,
    threshold: row.threshold,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at).getTime() : undefined,
    confirmedBy: row.confirmed_by ?? undefined,
    remark: row.remark ?? undefined,
  }
}

function listAlerts(filters?: alertRepo.AlertFilters) {
  const result = alertRepo.getAll(filters)
  const data = result.data.map(row => {
    const alert = mapAlertRow(row)
    const device = deviceRepo.getById(row.device_id)
    alert.deviceName = device?.name ?? 'Unknown'
    return alert
  })
  return { ...result, data }
}

function getAlert(id: string): Alert | null {
  const row = alertRepo.getById(id)
  if (!row) return null
  const alert = mapAlertRow(row)
  const device = deviceRepo.getById(row.device_id)
  alert.deviceName = device?.name ?? 'Unknown'
  return alert
}

function confirmAlert(id: string, confirmedBy: string): void {
  alertRepo.confirm(id, confirmedBy)
}

function resolveAlert(id: string, remark: string): void {
  alertRepo.resolve(id, remark)
}

function checkAlerts(): Alert[] {
  const db = getDb()
  const rules = db.prepare('SELECT * FROM alert_rules WHERE enabled = 1').all() as (AlertRule & { condition: string; threshold: number })[]
  const devices = deviceRepo.getAll()
  const newAlerts: Alert[] = []

  for (const device of devices) {
    const params = deviceRepo.getParamsByDeviceId(device.id)
    const deviceRules = rules.filter(r => r.deviceType === device.type)

    for (const rule of deviceRules) {
      const param = params.find(p => p.param_key === rule.paramKey)
      if (!param) continue

      let triggered = false
      if (rule.condition === 'gt' && param.value > rule.threshold) triggered = true
      if (rule.condition === 'lt' && param.value < rule.threshold) triggered = true
      if (rule.condition === 'eq' && param.value === rule.threshold) triggered = true

      if (triggered) {
        const row = alertRepo.create({
          device_id: device.id,
          level: rule.level,
          message: `${device.name}: ${param.label} ${rule.condition === 'gt' ? 'exceeds' : rule.condition === 'lt' ? 'below' : 'equals'} threshold (${param.value} ${param.unit})`,
          param_key: rule.paramKey,
          param_value: param.value,
          threshold: rule.threshold,
        })
        const alert = mapAlertRow(row)
        alert.deviceName = device.name
        newAlerts.push(alert)

        if (rule.level === 'critical') {
          deviceRepo.updateDeviceStatus(device.id, 'alarm')
        }
      }
    }
  }

  return newAlerts
}

export default {
  listAlerts,
  getAlert,
  confirmAlert,
  resolveAlert,
  checkAlerts,
}

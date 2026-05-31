import db from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import type { Alert, AlertRule, DeviceParams } from '../../shared/types.js'

const alertCooldowns = new Map<string, number>()
const COOLDOWN_MS = 300000

function getAlerts(filters: { level?: string; deviceId?: string; acknowledged?: string }): Alert[] {
  let sql = 'SELECT * FROM alert WHERE 1=1'
  const args: unknown[] = []

  if (filters.level) {
    sql += ' AND level = ?'
    args.push(filters.level)
  }
  if (filters.deviceId) {
    sql += ' AND deviceId = ?'
    args.push(filters.deviceId)
  }
  if (filters.acknowledged !== undefined) {
    sql += ' AND acknowledged = ?'
    args.push(filters.acknowledged === 'true' ? 1 : 0)
  }

  sql += ' ORDER BY timestamp DESC'

  const rows = db.prepare(sql).all(...args) as Array<Record<string, unknown>>
  return rows.map(r => ({
    id: r.id as string,
    deviceId: r.deviceId as string,
    deviceName: r.deviceName as string,
    level: r.level as Alert['level'],
    type: r.type as string,
    message: r.message as string,
    timestamp: r.timestamp as number,
    acknowledged: (r.acknowledged as number) === 1,
  }))
}

function acknowledgeAlert(id: string): boolean {
  const result = db.prepare('UPDATE alert SET acknowledged = 1 WHERE id = ?').run(id)
  return result.changes > 0
}

function getRules(): AlertRule[] {
  const rows = db.prepare('SELECT * FROM alert_rule ORDER BY name').all() as Array<Record<string, unknown>>
  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    paramName: r.paramName as string,
    operator: r.operator as AlertRule['operator'],
    threshold: r.threshold as number,
    level: r.level as AlertRule['level'],
    enabled: (r.enabled as number) === 1,
  }))
}

function createRule(rule: Omit<AlertRule, 'id'>): AlertRule {
  const id = uuidv4()
  db.prepare(`
    INSERT INTO alert_rule (id, name, paramName, operator, threshold, level, enabled)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, rule.name, rule.paramName, rule.operator, rule.threshold, rule.level, rule.enabled ? 1 : 0)

  return { id, ...rule }
}

function deleteRule(id: string): boolean {
  const result = db.prepare('DELETE FROM alert_rule WHERE id = ?').run(id)
  return result.changes > 0
}

function checkThresholds(deviceId: string, params: DeviceParams): Alert[] {
  const rules = getRules().filter(r => r.enabled)
  const device = db.prepare('SELECT name FROM device WHERE id = ?').get(deviceId) as { name: string } | undefined
  if (!device) return []

  const triggeredAlerts: Alert[] = []

  for (const rule of rules) {
    const value = params[rule.paramName as keyof DeviceParams]
    if (value === undefined) continue

    let triggered = false
    switch (rule.operator) {
      case '>': triggered = value > rule.threshold; break
      case '<': triggered = value < rule.threshold; break
      case '>=': triggered = value >= rule.threshold; break
      case '<=': triggered = value <= rule.threshold; break
      case '==': triggered = value === rule.threshold; break
    }

    if (triggered) {
      const cooldownKey = `${deviceId}:${rule.paramName}:${rule.operator}`
      const lastAlertTime = alertCooldowns.get(cooldownKey) ?? 0
      if (Date.now() - lastAlertTime < COOLDOWN_MS) continue
      alertCooldowns.set(cooldownKey, Date.now())

      const alert: Alert = {
        id: uuidv4(),
        deviceId,
        deviceName: device.name,
        level: rule.level,
        type: rule.paramName,
        message: `${rule.name}: ${rule.paramName}=${value} ${rule.operator} ${rule.threshold}`,
        timestamp: Date.now(),
        acknowledged: false,
      }

      db.prepare(`
        INSERT INTO alert (id, deviceId, deviceName, level, type, message, timestamp, acknowledged)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(alert.id, alert.deviceId, alert.deviceName, alert.level, alert.type, alert.message, alert.timestamp, 0)

      triggeredAlerts.push(alert)
    }
  }

  return triggeredAlerts
}

export { getAlerts, acknowledgeAlert, getRules, createRule, deleteRule, checkThresholds }

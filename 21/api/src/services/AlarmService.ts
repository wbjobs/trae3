import getSQLiteDB from '../database/sqlite'

type AlarmLevel = 'info' | 'warning' | 'critical'
type AlarmStatus = 'pending' | 'acknowledged' | 'resolved'
type SensorType = 'temperature' | 'humidity' | 'level' | 'pressure'

interface SensorData {
  cabinId: string
  sensorId: string
  sensorType: SensorType
  value: number
  unit: string
  timestamp: Date
}

interface AlarmRule {
  id: string
  sensorId: string
  condition: 'above' | 'below' | 'equals'
  threshold: number
  level: AlarmLevel
  enabled: boolean
}

interface AlarmLog {
  id: string
  ruleId: string
  sensorId: string
  triggerValue: number
  level: AlarmLevel
  timestamp: Date
  status: AlarmStatus
  handlerId?: string
  resolvedAt?: Date
}

export class AlarmService {
  private pendingAlarms: Map<string, AlarmLog> = new Map()
  private onAlarmCallback?: (alarm: AlarmLog) => void
  private alarmCooldowns: Map<string, number> = new Map()
  private readonly COOLDOWN_MS = 30000

  setAlarmCallback(callback: (alarm: AlarmLog) => void) {
    this.onAlarmCallback = callback
  }

  checkSensorData(sensorData: SensorData, sensor: any): AlarmLog | null {
    const now = Date.now()
    const cooldownKey = `${sensorData.sensorId}`
    const lastAlarmTime = this.alarmCooldowns.get(cooldownKey) || 0

    if (now - lastAlarmTime < this.COOLDOWN_MS) {
      return null
    }

    const isLowBad = sensor.alarmThreshold < sensor.warnThreshold

    let alarmLevel: AlarmLevel | null = null

    if (isLowBad) {
      if (sensorData.value <= sensor.alarmThreshold) {
        alarmLevel = 'critical'
      } else if (sensorData.value <= sensor.warnThreshold) {
        alarmLevel = 'warning'
      }
    } else {
      if (sensorData.value >= sensor.alarmThreshold) {
        alarmLevel = 'critical'
      } else if (sensorData.value >= sensor.warnThreshold) {
        alarmLevel = 'warning'
      }
    }

    if (alarmLevel) {
      const alarm = this.triggerAlarm(sensor.id, sensorData, alarmLevel)
      if (alarm) {
        this.alarmCooldowns.set(cooldownKey, now)
        return alarm
      }
    }

    return null
  }

  private triggerAlarm(sensorId: string, sensorData: SensorData, level: AlarmLevel): AlarmLog | null {
    const existingAlarm = Array.from(this.pendingAlarms.values()).find(
      a => a.sensorId === sensorId && a.level === level && a.status === 'pending'
    )

    if (existingAlarm) {
      existingAlarm.triggerValue = sensorData.value
      existingAlarm.timestamp = new Date()
      return null
    }

    const alarm: AlarmLog = {
      id: `alarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ruleId: '',
      sensorId,
      triggerValue: sensorData.value,
      level,
      timestamp: new Date(),
      status: 'pending',
    }

    this.pendingAlarms.set(alarm.id, alarm)
    this.saveAlarmLog(alarm)

    if (this.onAlarmCallback) {
      this.onAlarmCallback(alarm)
    }

    return alarm
  }

  private saveAlarmLog(alarm: AlarmLog): void {
    try {
      const db = getSQLiteDB()
      db.prepare(`
        INSERT INTO alarm_logs (id, rule_id, sensor_id, trigger_value, level, timestamp, status, message)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        alarm.id,
        alarm.ruleId || null,
        alarm.sensorId,
        alarm.triggerValue,
        alarm.level,
        alarm.timestamp.toISOString(),
        alarm.status,
        `${this.getSensorName(alarm.sensorId)} 触发${alarm.level === 'critical' ? '严重' : '警告'}告警`
      )
    } catch (error) {
      console.error('保存告警日志失败:', error)
    }
  }

  private getSensorName(sensorId: string): string {
    try {
      const db = getSQLiteDB()
      const row = db.prepare('SELECT name FROM sensors WHERE id = ?').get(sensorId) as any
      return row?.name || sensorId
    } catch {
      return sensorId
    }
  }

  acknowledgeAlarm(alarmId: string, handlerId: string): boolean {
    const alarm = this.pendingAlarms.get(alarmId)
    if (!alarm) return false

    alarm.status = 'acknowledged'
    alarm.handlerId = handlerId

    try {
      const db = getSQLiteDB()
      db.prepare(`
        UPDATE alarm_logs SET status = 'acknowledged', handler_id = ? WHERE id = ?
      `).run(handlerId, alarmId)
    } catch (error) {
      console.error('更新告警状态失败:', error)
    }

    return true
  }

  resolveAlarm(alarmId: string, handlerId: string): boolean {
    const alarm = this.pendingAlarms.get(alarmId)
    if (!alarm) return false

    alarm.status = 'resolved'
    alarm.handlerId = handlerId
    alarm.resolvedAt = new Date()
    this.pendingAlarms.delete(alarmId)

    const cooldownKey = `${alarm.sensorId}`
    this.alarmCooldowns.delete(cooldownKey)

    try {
      const db = getSQLiteDB()
      db.prepare(`
        UPDATE alarm_logs SET status = 'resolved', handler_id = ?, resolved_at = ? WHERE id = ?
      `).run(handlerId, new Date().toISOString(), alarmId)
    } catch (error) {
      console.error('更新告警状态失败:', error)
    }

    return true
  }

  getPendingAlarms(): AlarmLog[] {
    return Array.from(this.pendingAlarms.values())
  }

  getAlarmLogs(limit: number = 100, offset: number = 0): AlarmLog[] {
    try {
      const db = getSQLiteDB()
      const rows = db.prepare(`
        SELECT id, rule_id as ruleId, sensor_id as sensorId, trigger_value as triggerValue,
               level, timestamp, status, handler_id as handlerId, resolved_at as resolvedAt
        FROM alarm_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?
      `).all(limit, offset) as any[]

      return rows.map(row => ({
        id: row.id,
        ruleId: row.ruleId,
        sensorId: row.sensorId,
        triggerValue: row.triggerValue,
        level: row.level as AlarmLevel,
        timestamp: new Date(row.timestamp),
        status: row.status as AlarmStatus,
        handlerId: row.handlerId,
        resolvedAt: row.resolvedAt ? new Date(row.resolvedAt) : undefined,
      }))
    } catch (error) {
      console.error('获取告警日志失败:', error)
      return []
    }
  }

  getActiveAlarmCount(): number {
    return this.pendingAlarms.size
  }

  getTodayAlarmCount(): number {
    try {
      const today = new Date().toISOString().split('T')[0]
      const db = getSQLiteDB()
      const result = db.prepare(`
        SELECT COUNT(*) as count FROM alarm_logs WHERE DATE(timestamp) = ?
      `).get(today) as { count: number }

      return result.count
    } catch {
      return 0
    }
  }

  getAlarmRules(): AlarmRule[] {
    try {
      const db = getSQLiteDB()
      const rows = db.prepare(`
        SELECT id, sensor_id as sensorId, condition, threshold, level, enabled
        FROM alarm_rules
      `).all() as any[]

      return rows.map(row => ({
        id: row.id,
        sensorId: row.sensorId,
        condition: row.condition,
        threshold: row.threshold,
        level: row.level as AlarmLevel,
        enabled: row.enabled === 1,
      }))
    } catch {
      return []
    }
  }
}

export const alarmService = new AlarmService()

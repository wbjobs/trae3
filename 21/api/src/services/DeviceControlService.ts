import getSQLiteDB from '../database/sqlite'

type DeviceType = 'fan' | 'pump' | 'valve' | 'heater' | 'cooler'
type DeviceStatus = 'on' | 'off' | 'error'

interface Device {
  id: string
  cabinId: string
  type: DeviceType
  name: string
  status: DeviceStatus
  currentValue: number
  targetValue?: number
}

interface DeviceControlCommand {
  deviceId: string
  action: 'turnOn' | 'turnOff' | 'setValue'
  value?: number
  operatorId: string
}

interface ControlLog {
  id: string
  deviceId: string
  action: string
  value?: number
  operatorId: string
  timestamp: Date
  success: boolean
  message?: string
}

interface LinkageRule {
  id: string
  name: string
  description: string
  condition: {
    sensorId: string
    operator: '>' | '<' | '>=' | '<=' | '=='
    value: number
  }
  action: {
    deviceId: string
    command: 'turnOn' | 'turnOff' | 'setValue'
    value?: number
  }
  enabled: boolean
}

export class DeviceControlService {
  private onControlCallback?: (deviceId: string, action: string, value?: number) => void
  private linkageCooldowns: Map<string, number> = new Map()
  private readonly LINKAGE_COOLDOWN_MS = 300000
  private deviceCache: Map<string, Device> = new Map()
  private linkageRulesCache: LinkageRule[] | null = null
  private deviceListCache: Device[] | null = null

  setControlCallback(callback: (deviceId: string, action: string, value?: number) => void) {
    this.onControlCallback = callback
  }

  private invalidateCache(deviceId?: string) {
    this.deviceListCache = null
    if (deviceId) {
      this.deviceCache.delete(deviceId)
    } else {
      this.deviceCache.clear()
    }
  }

  getDevices(): Device[] {
    if (this.deviceListCache) return this.deviceListCache
    const db = getSQLiteDB()
    const rows = db.prepare(`
      SELECT id, cabin_id as cabinId, type, name, status, current_value as currentValue, target_value as targetValue
      FROM devices
    `).all() as any[]

    this.deviceListCache = rows.map(row => {
      const device: Device = {
        id: row.id,
        cabinId: row.cabinId,
        type: row.type,
        name: row.name,
        status: row.status as DeviceStatus,
        currentValue: row.currentValue,
        targetValue: row.targetValue,
      }
      this.deviceCache.set(device.id, device)
      return device
    })
    return this.deviceListCache
  }

  getDeviceById(deviceId: string): Device | null {
    const cached = this.deviceCache.get(deviceId)
    if (cached) return cached

    const db = getSQLiteDB()
    const row = db.prepare(`
      SELECT id, cabin_id as cabinId, type, name, status, current_value as currentValue, target_value as targetValue
      FROM devices WHERE id = ?
    `).get(deviceId) as any

    if (!row) return null

    const device: Device = {
      id: row.id,
      cabinId: row.cabinId,
      type: row.type,
      name: row.name,
      status: row.status as DeviceStatus,
      currentValue: row.currentValue,
      targetValue: row.targetValue,
    }
    this.deviceCache.set(device.id, device)
    return device
  }

  getDevicesByCabin(cabinId: string): Device[] {
    return this.getDevices().filter(d => d.cabinId === cabinId)
  }

  executeCommand(command: DeviceControlCommand): { success: boolean; message: string } {
    const device = this.getDeviceById(command.deviceId)
    if (!device) {
      return { success: false, message: '设备不存在' }
    }

    const db = getSQLiteDB()
    let newStatus: DeviceStatus = device.status
    let newValue = device.currentValue

    switch (command.action) {
      case 'turnOn':
        newStatus = 'on'
        newValue = command.value ?? 100
        break
      case 'turnOff':
        newStatus = 'off'
        newValue = 0
        break
      case 'setValue':
        if (command.value !== undefined) {
          newValue = Math.max(0, Math.min(100, command.value))
          newStatus = newValue > 0 ? 'on' : 'off'
        }
        break
    }

    db.prepare(`
      UPDATE devices SET status = ?, current_value = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(newStatus, newValue, command.deviceId)

    this.invalidateCache(command.deviceId)

    this.logControl({
      id: `log-${Date.now()}`,
      deviceId: command.deviceId,
      action: command.action,
      value: command.value,
      operatorId: command.operatorId,
      timestamp: new Date(),
      success: true,
    })

    if (this.onControlCallback) {
      this.onControlCallback(command.deviceId, command.action, command.value)
    }

    return { success: true, message: '命令执行成功' }
  }

  private logControl(log: ControlLog): void {
    const db = getSQLiteDB()
    db.prepare(`
      INSERT INTO control_logs (id, device_id, action, value, operator_id, timestamp, success, message)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      log.id,
      log.deviceId,
      log.action,
      log.value ?? null,
      log.operatorId,
      log.timestamp.toISOString(),
      log.success ? 1 : 0,
      log.message || null
    )
  }

  getControlLogs(limit: number = 50, offset: number = 0): ControlLog[] {
    const db = getSQLiteDB()
    const rows = db.prepare(`
      SELECT id, device_id as deviceId, action, value, operator_id as operatorId, timestamp, success, message
      FROM control_logs ORDER BY timestamp DESC LIMIT ? OFFSET ?
    `).all(limit, offset) as any[]

    return rows.map(row => ({
      id: row.id,
      deviceId: row.deviceId,
      action: row.action,
      value: row.value,
      operatorId: row.operatorId,
      timestamp: new Date(row.timestamp),
      success: row.success === 1,
      message: row.message,
    }))
  }

  getLinkageRules(): LinkageRule[] {
    if (this.linkageRulesCache) return this.linkageRulesCache
    const db = getSQLiteDB()
    const rows = db.prepare(`
      SELECT id, name, description, sensor_id as sensorId, sensor_operator as operator,
             sensor_value as sensorValue, device_id as deviceId, device_command as command,
             device_value as deviceValue, enabled
      FROM linkage_rules
    `).all() as any[]

    this.linkageRulesCache = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      condition: {
        sensorId: row.sensorId,
        operator: row.operator,
        value: row.sensorValue,
      },
      action: {
        deviceId: row.deviceId,
        command: row.command,
        value: row.deviceValue,
      },
      enabled: row.enabled === 1,
    }))
    return this.linkageRulesCache
  }

  checkLinkageRules(sensorId: string, value: number): void {
    const rules = this.getLinkageRules().filter(r => r.enabled && r.condition.sensorId === sensorId)
    const now = Date.now()

    for (const rule of rules) {
      let conditionMet = false
      switch (rule.condition.operator) {
        case '>':
          conditionMet = value > rule.condition.value
          break
        case '<':
          conditionMet = value < rule.condition.value
          break
        case '>=':
          conditionMet = value >= rule.condition.value
          break
        case '<=':
          conditionMet = value <= rule.condition.value
          break
        case '==':
          conditionMet = value === rule.condition.value
          break
      }

      if (conditionMet) {
        const cooldownKey = `${rule.id}`
        const lastExecTime = this.linkageCooldowns.get(cooldownKey) || 0

        if (now - lastExecTime < this.LINKAGE_COOLDOWN_MS) {
          continue
        }

        this.linkageCooldowns.set(cooldownKey, now)

        this.executeCommand({
          deviceId: rule.action.deviceId,
          action: rule.action.command as any,
          value: rule.action.value,
          operatorId: 'linkage-rule',
        })

        console.log(`联动规则 [${rule.name}] 触发: 传感器 ${sensorId} 值 ${value} ${rule.condition.operator} ${rule.condition.value} → 执行 ${rule.action.command} 设备 ${rule.action.deviceId}`)
      }
    }
  }
}

export const deviceControlService = new DeviceControlService()

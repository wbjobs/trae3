import db from '../database.js'
import type { DeviceParams, Device } from '../../shared/types.js'

type ParamsCallback = (deviceId: string, params: DeviceParams) => void
type StatusCallback = (deviceId: string, status: Device['status']) => void

interface PendingCommand {
  deviceId: string
  command: string
  params: Record<string, unknown>
  attempts: number
  maxAttempts: number
  timeout: number
  createdAt: number
  resolve: (value: { success: boolean; message: string }) => void
}

const devices = db.prepare('SELECT * FROM device').all() as Array<{
  id: string
  name: string
  model: string
  status: string
  lastSeen: number
}>

const paramsRows = db.prepare('SELECT * FROM device_params').all() as Array<{
  deviceId: string
  acVoltage: number
  acCurrent: number
  acFrequency: number
  acPower: number
  dcVoltage: number
  dcCurrent: number
  dcPower: number
  dailyEnergy: number
  totalEnergy: number
  temperature: number
  efficiency: number
}>

const paramsMap = new Map<string, DeviceParams>()
for (const p of paramsRows) {
  paramsMap.set(p.deviceId, {
    acVoltage: p.acVoltage,
    acCurrent: p.acCurrent,
    acFrequency: p.acFrequency,
    acPower: p.acPower,
    dcVoltage: p.dcVoltage,
    dcCurrent: p.dcCurrent,
    dcPower: p.dcPower,
    dailyEnergy: p.dailyEnergy,
    totalEnergy: p.totalEnergy,
    temperature: p.temperature,
    efficiency: p.efficiency,
  })
}

const connectionStatus = new Map<string, boolean>()
for (const d of devices) {
  connectionStatus.set(d.id, d.status === 'online')
}

const paramCallbacks: ParamsCallback[] = []
const statusCallbacks: StatusCallback[] = []
let intervalId: ReturnType<typeof setInterval> | null = null

const pendingCommands = new Map<string, PendingCommand>()
const deviceCommandQueues = new Map<string, PendingCommand[]>()
const MAX_RETRY_ATTEMPTS = 3
const COMMAND_TIMEOUT = 10000

const updateDeviceDb = db.prepare(`
  UPDATE device SET status = ?, lastSeen = ? WHERE id = ?
`)
const updateParamsDb = db.prepare(`
  UPDATE device_params SET acVoltage=?, acCurrent=?, acFrequency=?, acPower=?, dcVoltage=?, dcCurrent=?, dcPower=?, dailyEnergy=?, totalEnergy=?, temperature=?, efficiency=? WHERE deviceId=?
`)
const insertHistoryDb = db.prepare(`
  INSERT OR IGNORE INTO device_history (deviceId, timestamp, acVoltage, acCurrent, acFrequency, acPower, dcVoltage, dcCurrent, dcPower, dailyEnergy, totalEnergy, temperature, efficiency)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`)

function fluctuate(value: number, pct: number): number {
  return +(value * (1 + (Math.random() - 0.5) * 2 * pct)).toFixed(2)
}

function generateParamsUpdate(deviceId: string): DeviceParams {
  const current = paramsMap.get(deviceId)
  if (!current) return current!

  const updated: DeviceParams = {
    acVoltage: fluctuate(current.acVoltage, 0.02),
    acCurrent: fluctuate(current.acCurrent, 0.05),
    acFrequency: fluctuate(current.acFrequency, 0.01),
    acPower: fluctuate(current.acPower, 0.05),
    dcVoltage: fluctuate(current.dcVoltage, 0.02),
    dcCurrent: fluctuate(current.dcCurrent, 0.05),
    dcPower: fluctuate(current.dcPower, 0.05),
    dailyEnergy: +(current.dailyEnergy + current.acPower / 1000 * 3 / 3600).toFixed(2),
    totalEnergy: +(current.totalEnergy + current.acPower / 1000 * 3 / 3600).toFixed(2),
    temperature: fluctuate(current.temperature, 0.03),
    efficiency: +(current.efficiency + (Math.random() - 0.5) * 0.002).toFixed(4),
  }

  paramsMap.set(deviceId, updated)
  return updated
}

function processCommandQueue(deviceId: string) {
  const queue = deviceCommandQueues.get(deviceId)
  if (!queue || queue.length === 0) return

  const connected = connectionStatus.get(deviceId)
  if (!connected) return

  const cmd = queue[0]
  if (Date.now() - cmd.createdAt > cmd.timeout) {
    if (cmd.attempts >= cmd.maxAttempts) {
      queue.shift()
      cmd.resolve({ success: false, message: '指令超时，已达最大重试次数' })
      processCommandQueue(deviceId)
    } else {
      cmd.attempts++
      cmd.createdAt = Date.now()
      cmd.resolve({ success: true, message: `指令 ${cmd.command} 已下发` })
      queue.shift()
      processCommandQueue(deviceId)
    }
  } else {
    cmd.resolve({ success: true, message: `指令 ${cmd.command} 已下发` })
    queue.shift()
    processCommandQueue(deviceId)
  }
}

function tick() {
  const now = Date.now()
  const historyBucket = Math.floor(now / 60000) * 60000

  for (const d of devices) {
    const connected = connectionStatus.get(d.id)
    if (!connected) continue

    const updated = generateParamsUpdate(d.id)

    updateParamsDb.run(
      updated.acVoltage, updated.acCurrent, updated.acFrequency, updated.acPower,
      updated.dcVoltage, updated.dcCurrent, updated.dcPower,
      updated.dailyEnergy, updated.totalEnergy, updated.temperature, updated.efficiency,
      d.id
    )
    updateDeviceDb.run('online', now, d.id)
    insertHistoryDb.run(
      d.id, historyBucket,
      updated.acVoltage, updated.acCurrent, updated.acFrequency, updated.acPower,
      updated.dcVoltage, updated.dcCurrent, updated.dcPower,
      updated.dailyEnergy, updated.totalEnergy, updated.temperature, updated.efficiency
    )

    for (const cb of paramCallbacks) {
      cb(d.id, updated)
    }

    processCommandQueue(d.id)
  }

  if (Math.random() < 0.1) {
    const onlineDevices = devices.filter(d => connectionStatus.get(d.id))
    if (onlineDevices.length > 1) {
      const target = onlineDevices[Math.floor(Math.random() * onlineDevices.length)]
      connectionStatus.set(target.id, false)
      updateDeviceDb.run('offline', Date.now(), target.id)
      for (const cb of statusCallbacks) {
        cb(target.id, 'offline')
      }
      setTimeout(() => {
        connectionStatus.set(target.id, true)
        updateDeviceDb.run('online', Date.now(), target.id)
        for (const cb of statusCallbacks) {
          cb(target.id, 'online')
        }
      }, 10000 + Math.random() * 20000)
    }
  }
}

function start() {
  if (intervalId) return
  intervalId = setInterval(tick, 3000)
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}

function onParamsUpdate(callback: ParamsCallback) {
  paramCallbacks.push(callback)
}

function onStatusChange(callback: StatusCallback) {
  statusCallbacks.push(callback)
}

function sendCommand(deviceId: string, command: string, params?: Record<string, unknown>, options?: { maxAttempts?: number; timeout?: number }): Promise<{ success: boolean; message: string }> {
  return new Promise((resolve) => {
    const connected = connectionStatus.get(deviceId)
    if (!connected) {
      resolve({ success: false, message: '设备离线' })
      return
    }

    const cmd: PendingCommand = {
      deviceId,
      command,
      params: params || {},
      attempts: 1,
      maxAttempts: options?.maxAttempts || MAX_RETRY_ATTEMPTS,
      timeout: options?.timeout || COMMAND_TIMEOUT,
      createdAt: Date.now(),
      resolve,
    }

    if (!deviceCommandQueues.has(deviceId)) {
      deviceCommandQueues.set(deviceId, [])
    }
    deviceCommandQueues.get(deviceId)!.push(cmd)
  })
}

export { start, stop, onParamsUpdate, onStatusChange, sendCommand }

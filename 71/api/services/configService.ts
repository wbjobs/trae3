import db, { logParamChange } from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import { validateConfigParams } from './validator.js'
import { sendCommand } from './connectionManager.js'
import { broadcast } from '../websocket.js'
import type { ConfigParams, ConfigTemplate, ConfigHistory } from '../../shared/types.js'

function calculateDiff(oldParams: Record<string, unknown>, newParams: ConfigParams) {
  const diff: Record<string, { old: number; new: number }> = {}
  for (const [key, newValue] of Object.entries(newParams)) {
    const oldValue = oldParams[key]
    if (typeof oldValue === 'number' && typeof newValue === 'number' && Math.abs(oldValue - newValue) >= 0.001) {
      diff[key] = { old: oldValue, new: newValue }
    }
  }
  return diff
}

async function applyConfig(deviceIds: string[], params: ConfigParams) {
  const validation = validateConfigParams(params)
  if (!validation.valid) {
    return { taskId: null, results: validation.errors, diffs: {} }
  }

  const taskId = uuidv4()
  const results: Record<string, 'success' | 'failed' | 'pending'> = {}
  const diffs: Record<string, Record<string, { old: number; new: number }>> = {}

  const insertHistory = db.prepare(`
    INSERT INTO config_history (deviceId, params, previousParams, appliedBy, appliedAt, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `)

  const getDevice = db.prepare(`
    SELECT d.name, p.* FROM device d LEFT JOIN device_params p ON d.id = p.deviceId WHERE d.id = ?
  `)

  for (const deviceId of deviceIds) {
    results[deviceId] = 'pending'
    broadcast('config:progress', { deviceId, status: 'pending' })

    try {
      const oldDevice = getDevice.get(deviceId) as Record<string, unknown> | undefined
      const previousParams = oldDevice ? { ...oldDevice } : {}
      delete previousParams.name
      
      const diff = oldDevice ? calculateDiff(oldDevice, params) : {}
      diffs[deviceId] = diff

      const result = await sendCommand(deviceId, 'applyConfig', params as unknown as Record<string, unknown>)
      const status: 'success' | 'failed' = result.success ? 'success' : 'failed'
      results[deviceId] = status
      insertHistory.run(deviceId, JSON.stringify(params), JSON.stringify(previousParams), 'admin', Date.now(), status)
      broadcast('config:progress', { deviceId, status, diff })

      if (status === 'success' && oldDevice) {
        const deviceName = oldDevice.name as string
        for (const [paramName, values] of Object.entries(diff)) {
          logParamChange(deviceId, deviceName, paramName, values.old, values.new, 'admin', 'config')
        }
      }
    } catch {
      results[deviceId] = 'failed'
      diffs[deviceId] = {}
      insertHistory.run(deviceId, JSON.stringify(params), null, 'admin', Date.now(), 'failed')
      broadcast('config:progress', { deviceId, status: 'failed', diff: {} })
    }
  }

  return { taskId, results, diffs }
}

function getTemplates(): ConfigTemplate[] {
  const rows = db.prepare('SELECT * FROM config_template ORDER BY createdAt DESC').all() as Array<Record<string, unknown>>
  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    description: r.description as string,
    params: JSON.parse(r.params as string),
    createdAt: r.createdAt as number,
  }))
}

function saveTemplate(template: Omit<ConfigTemplate, 'id' | 'createdAt'>): ConfigTemplate {
  const id = uuidv4()
  const createdAt = Date.now()
  db.prepare(`
    INSERT INTO config_template (id, name, description, params, createdAt)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, template.name, template.description, JSON.stringify(template.params), createdAt)

  return { id, ...template, createdAt }
}

function getHistory(): ConfigHistory[] {
  const rows = db.prepare('SELECT * FROM config_history ORDER BY appliedAt DESC LIMIT 100').all() as Array<Record<string, unknown>>
  return rows.map(r => ({
    id: r.id as number,
    deviceId: r.deviceId as string,
    params: JSON.parse(r.params as string),
    previousParams: r.previousParams ? JSON.parse(r.previousParams as string) : undefined,
    appliedBy: r.appliedBy as string,
    appliedAt: r.appliedAt as number,
    status: r.status as ConfigHistory['status'],
  }))
}

export { applyConfig, getTemplates, saveTemplate, getHistory }

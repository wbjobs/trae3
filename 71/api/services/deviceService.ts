import db from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import type { Device, DeviceParams, HistoryRecord, DeviceGroup } from '../../shared/types.js'

function getAllDevices(): (Device & { groupIds: string[] })[] {
  const rows = db.prepare(`
    SELECT d.*, p.acVoltage, p.acCurrent, p.acFrequency, p.acPower,
      p.dcVoltage, p.dcCurrent, p.dcPower, p.dailyEnergy, p.totalEnergy,
      p.temperature, p.efficiency
    FROM device d LEFT JOIN device_params p ON d.id = p.deviceId
  `).all() as Array<Record<string, unknown>>

  const groupMembers = db.prepare(`
    SELECT deviceId, groupId FROM device_group_member
  `).all() as Array<{ deviceId: string; groupId: string }>

  const deviceGroups = new Map<string, string[]>()
  for (const gm of groupMembers) {
    if (!deviceGroups.has(gm.deviceId)) {
      deviceGroups.set(gm.deviceId, [])
    }
    deviceGroups.get(gm.deviceId)!.push(gm.groupId)
  }

  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    model: r.model as string,
    status: r.status as Device['status'],
    lastSeen: r.lastSeen as number,
    params: {
      acVoltage: r.acVoltage as number,
      acCurrent: r.acCurrent as number,
      acFrequency: r.acFrequency as number,
      acPower: r.acPower as number,
      dcVoltage: r.dcVoltage as number,
      dcCurrent: r.dcCurrent as number,
      dcPower: r.dcPower as number,
      dailyEnergy: r.dailyEnergy as number,
      totalEnergy: r.totalEnergy as number,
      temperature: r.temperature as number,
      efficiency: r.efficiency as number,
    },
    groupIds: deviceGroups.get(r.id as string) || [],
  }))
}

function getDevicesByGroup(groupId: string): Device[] {
  const rows = db.prepare(`
    SELECT d.*, p.acVoltage, p.acCurrent, p.acFrequency, p.acPower,
      p.dcVoltage, p.dcCurrent, p.dcPower, p.dailyEnergy, p.totalEnergy,
      p.temperature, p.efficiency
    FROM device d 
    INNER JOIN device_group_member gm ON d.id = gm.deviceId
    LEFT JOIN device_params p ON d.id = p.deviceId
    WHERE gm.groupId = ?
  `).all(groupId) as Array<Record<string, unknown>>

  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    model: r.model as string,
    status: r.status as Device['status'],
    lastSeen: r.lastSeen as number,
    params: {
      acVoltage: r.acVoltage as number,
      acCurrent: r.acCurrent as number,
      acFrequency: r.acFrequency as number,
      acPower: r.acPower as number,
      dcVoltage: r.dcVoltage as number,
      dcCurrent: r.dcCurrent as number,
      dcPower: r.dcPower as number,
      dailyEnergy: r.dailyEnergy as number,
      totalEnergy: r.totalEnergy as number,
      temperature: r.temperature as number,
      efficiency: r.efficiency as number,
    },
  }))
}

function getDeviceById(id: string): Device | null {
  const r = db.prepare(`
    SELECT d.*, p.acVoltage, p.acCurrent, p.acFrequency, p.acPower,
      p.dcVoltage, p.dcCurrent, p.dcPower, p.dailyEnergy, p.totalEnergy,
      p.temperature, p.efficiency
    FROM device d LEFT JOIN device_params p ON d.id = p.deviceId
    WHERE d.id = ?
  `).get(id) as Record<string, unknown> | undefined

  if (!r) return null

  return {
    id: r.id as string,
    name: r.name as string,
    model: r.model as string,
    status: r.status as Device['status'],
    lastSeen: r.lastSeen as number,
    params: {
      acVoltage: r.acVoltage as number,
      acCurrent: r.acCurrent as number,
      acFrequency: r.acFrequency as number,
      acPower: r.acPower as number,
      dcVoltage: r.dcVoltage as number,
      dcCurrent: r.dcCurrent as number,
      dcPower: r.dcPower as number,
      dailyEnergy: r.dailyEnergy as number,
      totalEnergy: r.totalEnergy as number,
      temperature: r.temperature as number,
      efficiency: r.efficiency as number,
    },
  }
}

function getDeviceHistory(id: string, hours: number = 24): HistoryRecord[] {
  const since = Date.now() - hours * 3600000
  const rows = db.prepare(`
    SELECT * FROM device_history WHERE deviceId = ? AND timestamp >= ? ORDER BY timestamp ASC
  `).all(id, since) as Array<Record<string, unknown>>

  return rows.map(r => ({
    timestamp: r.timestamp as number,
    params: {
      acVoltage: r.acVoltage as number,
      acCurrent: r.acCurrent as number,
      acFrequency: r.acFrequency as number,
      acPower: r.acPower as number,
      dcVoltage: r.dcVoltage as number,
      dcCurrent: r.dcCurrent as number,
      dcPower: r.dcPower as number,
      dailyEnergy: r.dailyEnergy as number,
      totalEnergy: r.totalEnergy as number,
      temperature: r.temperature as number,
      efficiency: r.efficiency as number,
    },
  }))
}

function getAggregatedStats() {
  const devices = getAllDevices()
  const onlineCount = devices.filter(d => d.status === 'online').length
  const totalPower = devices.reduce((sum, d) => sum + d.params.acPower, 0)
  const dailyEnergy = devices.reduce((sum, d) => sum + d.params.dailyEnergy, 0)

  return {
    totalPower: +totalPower.toFixed(2),
    dailyEnergy: +dailyEnergy.toFixed(2),
    onlineRate: devices.length > 0 ? +(onlineCount / devices.length * 100).toFixed(1) : 0,
    deviceCount: devices.length,
    onlineCount,
  }
}

function getGroups(): DeviceGroup[] {
  const groups = db.prepare(`
    SELECT g.*, COUNT(gm.deviceId) as deviceCount
    FROM device_group g LEFT JOIN device_group_member gm ON g.id = gm.groupId
    GROUP BY g.id
    ORDER BY g.createdAt DESC
  `).all() as Array<Record<string, unknown>>
  const members = db.prepare('SELECT groupId, deviceId FROM device_group_member').all() as Array<{ groupId: string; deviceId: string }>
  const memberMap = new Map<string, string[]>()
  for (const m of members) {
    if (!memberMap.has(m.groupId)) memberMap.set(m.groupId, [])
    memberMap.get(m.groupId)!.push(m.deviceId)
  }
  return groups.map(g => ({
    id: g.id as string,
    name: g.name as string,
    description: g.description as string,
    color: g.color as string,
    deviceCount: g.deviceCount as number,
    deviceIds: memberMap.get(g.id as string) || [],
    createdAt: g.createdAt as number,
  }))
}

function createGroup(name: string, description: string, deviceIds: string[]): DeviceGroup {
  const id = uuidv4()
  const createdAt = Date.now()
  const color = '#06B6D4'
  const transaction = db.transaction(() => {
    db.prepare('INSERT INTO device_group (id, name, description, color, createdAt) VALUES (?, ?, ?, ?, ?)').run(id, name, description, color, createdAt)
    const insertMember = db.prepare('INSERT INTO device_group_member (groupId, deviceId, joinedAt) VALUES (?, ?, ?)')
    for (const deviceId of deviceIds) {
      insertMember.run(id, deviceId, createdAt)
    }
  })
  transaction()
  return { id, name, description, color, deviceCount: deviceIds.length, deviceIds, createdAt }
}

function updateGroup(id: string, name: string, description: string, deviceIds: string[]): DeviceGroup | null {
  const existing = db.prepare('SELECT id, color, createdAt FROM device_group WHERE id = ?').get(id) as { id: string; color: string; createdAt: number } | undefined
  if (!existing) return null
  const transaction = db.transaction(() => {
    db.prepare('UPDATE device_group SET name = ?, description = ? WHERE id = ?').run(name, description, id)
    db.prepare('DELETE FROM device_group_member WHERE groupId = ?').run(id)
    const insertMember = db.prepare('INSERT INTO device_group_member (groupId, deviceId, joinedAt) VALUES (?, ?, ?)')
    const now = Date.now()
    for (const deviceId of deviceIds) {
      insertMember.run(id, deviceId, now)
    }
  })
  transaction()
  return { id, name, description, color: existing.color, deviceCount: deviceIds.length, deviceIds, createdAt: existing.createdAt }
}

function deleteGroup(id: string): boolean {
  const existing = db.prepare('SELECT id FROM device_group WHERE id = ?').get(id)
  if (!existing) return false
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM device_group_member WHERE groupId = ?').run(id)
    db.prepare('DELETE FROM device_group WHERE id = ?').run(id)
  })
  transaction()
  return true
}

function getGroupDevices(groupId: string): Device[] {
  const rows = db.prepare(`
    SELECT d.*, p.acVoltage, p.acCurrent, p.acFrequency, p.acPower,
      p.dcVoltage, p.dcCurrent, p.dcPower, p.dailyEnergy, p.totalEnergy,
      p.temperature, p.efficiency
    FROM device d 
    INNER JOIN device_group_member gm ON d.id = gm.deviceId
    LEFT JOIN device_params p ON d.id = p.deviceId
    WHERE gm.groupId = ?
  `).all(groupId) as Array<Record<string, unknown>>

  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    model: r.model as string,
    status: r.status as Device['status'],
    lastSeen: r.lastSeen as number,
    params: {
      acVoltage: r.acVoltage as number,
      acCurrent: r.acCurrent as number,
      acFrequency: r.acFrequency as number,
      acPower: r.acPower as number,
      dcVoltage: r.dcVoltage as number,
      dcCurrent: r.dcCurrent as number,
      dcPower: r.dcPower as number,
      dailyEnergy: r.dailyEnergy as number,
      totalEnergy: r.totalEnergy as number,
      temperature: r.temperature as number,
      efficiency: r.efficiency as number,
    },
  }))
}

export { getAllDevices, getDeviceById, getDeviceHistory, getAggregatedStats, getGroups, createGroup, updateGroup, deleteGroup, getGroupDevices, getDevicesByGroup }

import { Router, type Request, type Response } from 'express'
import db from '../database.js'
import { v4 as uuidv4 } from 'uuid'
import type { DeviceGroup, Device } from '../../shared/types.js'

const router = Router()

function getDeviceParams() {
  return `
    SELECT d.*, p.acVoltage, p.acCurrent, p.acFrequency, p.acPower,
      p.dcVoltage, p.dcCurrent, p.dcPower, p.dailyEnergy, p.totalEnergy,
      p.temperature, p.efficiency
    FROM device d LEFT JOIN device_params p ON d.id = p.deviceId
  `
}

router.get('/', (_req: Request, res: Response) => {
  const groups = db.prepare(`
    SELECT g.*, COUNT(gm.deviceId) as deviceCount
    FROM device_group g
    LEFT JOIN device_group_member gm ON g.id = gm.groupId
    GROUP BY g.id
    ORDER BY g.createdAt DESC
  `).all() as Array<Record<string, unknown>>

  const members = db.prepare('SELECT groupId, deviceId FROM device_group_member').all() as Array<{ groupId: string; deviceId: string }>
  const memberMap = new Map<string, string[]>()
  for (const m of members) {
    if (!memberMap.has(m.groupId)) memberMap.set(m.groupId, [])
    memberMap.get(m.groupId)!.push(m.deviceId)
  }

  const result = groups.map(g => ({
    id: g.id,
    name: g.name,
    description: g.description,
    color: g.color,
    deviceCount: g.deviceCount,
    deviceIds: memberMap.get(g.id as string) || [],
    createdAt: g.createdAt,
  }))

  res.json({ success: true, groups: result })
})

router.post('/', (req: Request, res: Response) => {
  const { name, description, color } = req.body
  if (!name) {
    res.status(400).json({ success: false, error: '名称不能为空' })
    return
  }

  const id = uuidv4()
  const createdAt = Date.now()
  const groupColor = color || '#06B6D4'

  try {
    db.prepare(`
      INSERT INTO device_group (id, name, description, color, createdAt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, description || '', groupColor, createdAt)

    const group: DeviceGroup = {
      id,
      name,
      description: description || '',
      color: groupColor,
      deviceCount: 0,
      deviceIds: [],
      createdAt
    }

    res.json({ success: true, group })
  } catch {
    res.status(400).json({ success: false, error: '分组名称已存在' })
  }
})

router.delete('/:id', (req: Request, res: Response) => {
  const existing = db.prepare('SELECT id FROM device_group WHERE id = ?').get(req.params.id)
  if (!existing) {
    res.status(404).json({ success: false, error: '分组不存在' })
    return
  }

  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM device_group_member WHERE groupId = ?').run(req.params.id)
    db.prepare('DELETE FROM device_group WHERE id = ?').run(req.params.id)
  })
  transaction()

  res.json({ success: true })
})

router.get('/:id/devices', (req: Request, res: Response) => {
  const group = db.prepare('SELECT id FROM device_group WHERE id = ?').get(req.params.id)
  if (!group) {
    res.status(404).json({ success: false, error: '分组不存在' })
    return
  }

  const rows = db.prepare(`
    ${getDeviceParams()}
    INNER JOIN device_group_member gm ON d.id = gm.deviceId
    WHERE gm.groupId = ?
  `).all(req.params.id) as Array<Record<string, unknown>>

  const devices: Device[] = rows.map(r => ({
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

  res.json({ success: true, devices })
})

router.post('/:id/devices', (req: Request, res: Response) => {
  const { deviceId } = req.body
  if (!deviceId) {
    res.status(400).json({ success: false, error: '设备ID不能为空' })
    return
  }

  const group = db.prepare('SELECT id FROM device_group WHERE id = ?').get(req.params.id)
  if (!group) {
    res.status(404).json({ success: false, error: '分组不存在' })
    return
  }

  const device = db.prepare('SELECT id FROM device WHERE id = ?').get(deviceId)
  if (!device) {
    res.status(404).json({ success: false, error: '设备不存在' })
    return
  }

  try {
    db.prepare(`
      INSERT INTO device_group_member (groupId, deviceId, joinedAt)
      VALUES (?, ?, ?)
    `).run(req.params.id, deviceId, Date.now())

    res.json({ success: true })
  } catch {
    res.status(400).json({ success: false, error: '设备已在分组中' })
  }
})

router.delete('/:id/devices/:deviceId', (req: Request, res: Response) => {
  const result = db.prepare(`
    DELETE FROM device_group_member WHERE groupId = ? AND deviceId = ?
  `).run(req.params.id, req.params.deviceId)

  if (result.changes === 0) {
    res.status(404).json({ success: false, error: '设备不在分组中' })
    return
  }

  res.json({ success: true })
})

export default router

import { Router, type Request, type Response } from 'express'
import { getAllDevices, getDeviceById, getDeviceHistory, getAggregatedStats, getGroups, createGroup, updateGroup, deleteGroup, getGroupDevices } from '../services/deviceService.js'
import db from '../database.js'

const router = Router()

router.get('/', (_req: Request, res: Response) => {
  const devices = getAllDevices()
  res.json({ devices })
})

router.get('/stats', (_req: Request, res: Response) => {
  res.json(getAggregatedStats())
})

router.get('/trend', (req: Request, res: Response) => {
  const range = (req.query.range as string) || '24h'
  const hours = range === '1h' ? 1 : range === '6h' ? 6 : range === '7d' ? 168 : 24
  const since = Date.now() - hours * 3600000

  const rows = db.prepare(`
    SELECT timestamp, SUM(acPower) as power FROM device_history
    WHERE timestamp >= ?
    GROUP BY timestamp
    ORDER BY timestamp ASC
  `).all(since) as Array<{ timestamp: number; power: number }>

  const records = rows.map(r => ({
    time: new Date(r.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    power: +(r.power).toFixed(1),
  }))

  res.json({ records })
})

router.get('/groups', (_req: Request, res: Response) => {
  const groups = getGroups()
  res.json({ groups })
})

router.post('/groups', (req: Request, res: Response) => {
  const { name, description, deviceIds } = req.body
  if (!name || !Array.isArray(deviceIds)) {
    res.status(400).json({ success: false, error: '参数错误' })
    return
  }
  const group = createGroup(name, description || '', deviceIds)
  res.json({ success: true, group })
})

router.put('/groups/:id', (req: Request, res: Response) => {
  const { name, description, deviceIds } = req.body
  if (!name || !Array.isArray(deviceIds)) {
    res.status(400).json({ success: false, error: '参数错误' })
    return
  }
  const group = updateGroup(req.params.id, name, description || '', deviceIds)
  if (!group) {
    res.status(404).json({ success: false, error: '分组不存在' })
    return
  }
  res.json({ success: true, group })
})

router.delete('/groups/:id', (req: Request, res: Response) => {
  const deleted = deleteGroup(req.params.id)
  if (!deleted) {
    res.status(404).json({ success: false, error: '分组不存在' })
    return
  }
  res.json({ success: true })
})

router.get('/groups/:id/devices', (req: Request, res: Response) => {
  const devices = getGroupDevices(req.params.id)
  res.json({ devices })
})

router.get('/:id', (req: Request, res: Response) => {
  const device = getDeviceById(req.params.id)
  if (!device) {
    res.status(404).json({ success: false, error: '设备不存在' })
    return
  }
  res.json(device)
})

router.get('/:id/history', (req: Request, res: Response) => {
  const hours = parseInt(req.query.hours as string) || 24
  const history = getDeviceHistory(req.params.id, hours)
  res.json({ history })
})

export default router

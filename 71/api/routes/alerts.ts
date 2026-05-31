import { Router, type Request, type Response } from 'express'
import { getAlerts, acknowledgeAlert, getRules, createRule, deleteRule } from '../services/alertService.js'
import type { AlertRule } from '../../shared/types.js'

const router = Router()

router.get('/', (req: Request, res: Response) => {
  const filters = {
    level: req.query.level as string | undefined,
    deviceId: req.query.deviceId as string | undefined,
    acknowledged: req.query.acknowledged as string | undefined,
  }
  const alerts = getAlerts(filters)
  res.json({ alerts })
})

router.post('/:id/acknowledge', (req: Request, res: Response) => {
  const success = acknowledgeAlert(req.params.id)
  if (!success) {
    res.status(404).json({ success: false, error: '告警不存在' })
    return
  }
  res.json({ success: true })
})

router.get('/rules', (_req: Request, res: Response) => {
  const rules = getRules()
  res.json({ rules })
})

router.post('/rules', (req: Request, res: Response) => {
  const rule = req.body as Omit<AlertRule, 'id'>
  if (!rule.name || !rule.paramName || !rule.operator || rule.threshold === undefined || !rule.level) {
    res.status(400).json({ success: false, error: '规则参数无效' })
    return
  }
  const created = createRule(rule)
  res.json({ rule: created })
})

router.delete('/rules/:id', (req: Request, res: Response) => {
  const success = deleteRule(req.params.id)
  if (!success) {
    res.status(404).json({ success: false, error: '规则不存在' })
    return
  }
  res.json({ success: true })
})

export default router

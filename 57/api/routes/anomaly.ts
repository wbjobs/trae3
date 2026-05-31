import { Router, type Request, type Response } from 'express'
import { detectAnomalies, confirmAlert } from '../services/anomalyService.js'
import type { AlertLevel } from '../../shared/types.js'

const router = Router()

router.get('/detect', (req: Request, res: Response): void => {
  try {
    const { stationId, level, startTime, endTime, page, pageSize } = req.query as Record<string, string>
    const result = detectAnomalies({
      stationId: stationId || undefined,
      level: level as AlertLevel | undefined,
      startTime: startTime || undefined,
      endTime: endTime || undefined,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    })
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

router.post('/confirm', (req: Request, res: Response): void => {
  try {
    const { alertId, action, comment } = req.body as { alertId: string; action: 'confirm' | 'ignore'; comment?: string }
    if (!alertId || !action) {
      res.status(400).json({ success: false, error: '缺少必要参数: alertId, action' })
      return
    }
    if (action !== 'confirm' && action !== 'ignore') {
      res.status(400).json({ success: false, error: 'action 必须为 confirm 或 ignore' })
      return
    }
    const result = confirmAlert(alertId, action, comment)
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

export default router

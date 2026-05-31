import { Router, type Request, type Response } from 'express'
import { calculate } from '../services/indicatorService.js'
import type { IndicatorType } from '../../shared/types.js'

const router = Router()

router.get('/calculate', (req: Request, res: Response): void => {
  try {
    const { stationId, indicatorType, startTime, endTime } = req.query as Record<string, string>
    if (!stationId || !indicatorType || !startTime || !endTime) {
      res.status(400).json({ success: false, error: '缺少必要参数: stationId, indicatorType, startTime, endTime' })
      return
    }
    const result = calculate({
      stationId,
      indicatorType: indicatorType as IndicatorType,
      startTime,
      endTime,
    })
    res.json({ success: true, indicatorType: result.indicatorType, value: result.value, unit: result.unit, description: result.description, details: result.details })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

export default router

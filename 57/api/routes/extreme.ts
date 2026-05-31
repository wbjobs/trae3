import { Router, type Request, type Response } from 'express'
import { getExtremeStatistics, getExtremeWarnings, getHistoricalExtremes } from '../services/extremeService.js'

const router = Router()

router.get('/statistics', (req: Request, res: Response): void => {
  try {
    const { stationId, metric, startTime, endTime } = req.query as Record<string, string>
    if (!stationId || !metric || !startTime || !endTime) {
      res.status(400).json({ success: false, error: '缺少必要参数: stationId, metric, startTime, endTime' })
      return
    }
    const result = getExtremeStatistics(stationId, metric, startTime, endTime)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

router.get('/warnings', (req: Request, res: Response): void => {
  try {
    const { stationId, metric, page, pageSize } = req.query as Record<string, string>
    const result = getExtremeWarnings(
      stationId || undefined,
      metric || undefined,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 20,
    )
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

router.get('/historical', (req: Request, res: Response): void => {
  try {
    const { stationId, metric } = req.query as Record<string, string>
    if (!stationId || !metric) {
      res.status(400).json({ success: false, error: '缺少必要参数: stationId, metric' })
      return
    }
    const result = getHistoricalExtremes(stationId, metric)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

export default router

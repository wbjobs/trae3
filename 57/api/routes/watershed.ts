import { Router, type Request, type Response } from 'express'
import {
  getUpstreamDownstreamAnalysis,
  getRainfallRunoffResponse,
  getCrossStationCorrelation,
} from '../services/watershedService.js'

const router = Router()

router.get('/upstream-downstream', (req: Request, res: Response): void => {
  try {
    const { river, startTime, endTime } = req.query as Record<string, string>
    if (!river || !startTime || !endTime) {
      res.status(400).json({ success: false, error: '缺少必要参数: river, startTime, endTime' })
      return
    }
    const result = getUpstreamDownstreamAnalysis(river, startTime, endTime)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

router.get('/rainfall-runoff', (req: Request, res: Response): void => {
  try {
    const { stationId, startTime, endTime } = req.query as Record<string, string>
    if (!stationId || !startTime || !endTime) {
      res.status(400).json({ success: false, error: '缺少必要参数: stationId, startTime, endTime' })
      return
    }
    const result = getRainfallRunoffResponse(stationId, startTime, endTime)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

router.get('/cross-correlation', (req: Request, res: Response): void => {
  try {
    const { stationIds, metric, startTime, endTime } = req.query as Record<string, string>
    if (!stationIds || !metric || !startTime || !endTime) {
      res.status(400).json({ success: false, error: '缺少必要参数: stationIds, metric, startTime, endTime' })
      return
    }
    const ids = stationIds.split(',')
    const result = getCrossStationCorrelation(ids, metric, startTime, endTime)
    res.json({ success: true, data: result })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

export default router

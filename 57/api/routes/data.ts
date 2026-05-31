import { Router, type Request, type Response } from 'express'
import { reportData, queryData } from '../services/dataService.js'
import type { DataReportRequest, AggregationType } from '../../shared/types.js'

const router = Router()

router.post('/report', (req: Request, res: Response): void => {
  try {
    const request = req.body as DataReportRequest
    if (!request.stationId || !request.timestamp || !request.metrics) {
      res.status(400).json({ success: false, error: '缺少必要参数: stationId, timestamp, metrics' })
      return
    }
    const result = reportData(request)
    res.json(result)
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

router.get('/query', (req: Request, res: Response): void => {
  try {
    const { stationIds, startTime, endTime, metrics, aggregation, page, pageSize } = req.query as Record<string, string>
    if (!stationIds || !startTime || !endTime || !metrics) {
      res.status(400).json({ success: false, error: '缺少必要参数: stationIds, startTime, endTime, metrics' })
      return
    }
    const result = queryData({
      stationIds,
      startTime,
      endTime,
      metrics,
      aggregation: aggregation as AggregationType | undefined,
      page: page ? parseInt(page) : undefined,
      pageSize: pageSize ? parseInt(pageSize) : undefined,
    })
    res.json({ success: true, ...result })
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message })
  }
})

export default router

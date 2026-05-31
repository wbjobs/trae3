import { Router, type Request, type Response } from 'express'
import { aggregateHourlyData, aggregateDailyData, purgeOldData, flushHistoryBuffer } from '../database.js'

const router = Router()

router.post('/aggregate-hourly', (_req: Request, res: Response): void => {
  try {
    aggregateHourlyData()
    res.json({ success: true, message: 'Hourly aggregation completed' })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

router.post('/aggregate-daily', (_req: Request, res: Response): void => {
  try {
    aggregateDailyData()
    res.json({ success: true, message: 'Daily aggregation completed' })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

router.post('/purge', (_req: Request, res: Response): void => {
  try {
    purgeOldData()
    res.json({ success: true, message: 'Old data purged' })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

router.post('/flush-history', (_req: Request, res: Response): void => {
  try {
    flushHistoryBuffer()
    res.json({ success: true, message: 'History buffer flushed' })
  } catch (err) {
    res.status(500).json({ success: false, error: String(err) })
  }
})

export default router

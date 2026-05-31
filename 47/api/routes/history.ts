import { Router, type Request, type Response } from 'express'
import { queryHistory, getKpi } from '../db.js'

const router = Router()

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { start, end, metrics, arrayIds, interval } = req.query

  if (!start || !end || !metrics) {
    res.status(400).json({ success: false, error: 'Missing required params: start, end, metrics' })
    return
  }

  const query = {
    start: String(start),
    end: String(end),
    metrics: String(metrics).split(','),
    arrayIds: arrayIds ? String(arrayIds).split(',') : undefined,
    interval: interval as '1m' | '5m' | '15m' | '1h' | undefined,
  }

  const result = await queryHistory(query)
  res.json({ success: true, data: result })
})

router.get('/kpi', (_req: Request, res: Response): void => {
  const kpi = getKpi()
  res.json({ success: true, data: kpi })
})

export default router

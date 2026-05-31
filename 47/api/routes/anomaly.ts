import { Router, type Request, type Response } from 'express'
import { queryAnomalyEvents, getAnomalyHeatmap } from '../db.js'

const router = Router()

router.get('/events', (req: Request, res: Response): void => {
  const { start, end, level, type, page, pageSize } = req.query

  if (!start || !end) {
    res.status(400).json({ success: false, error: 'Missing required params: start, end' })
    return
  }

  const query = {
    start: String(start),
    end: String(end),
    level: level ? String(level) : undefined,
    type: type ? String(type) : undefined,
    page: page ? Number(page) : undefined,
    pageSize: pageSize ? Number(pageSize) : undefined,
  }

  const result = queryAnomalyEvents(query)
  res.json({ success: true, data: result })
})

router.get('/heatmap', (req: Request, res: Response): void => {
  const { date } = req.query

  if (!date) {
    res.status(400).json({ success: false, error: 'Missing required param: date' })
    return
  }

  const result = getAnomalyHeatmap(String(date))
  res.json({ success: true, data: result })
})

export default router

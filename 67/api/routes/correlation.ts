import { Router, type Request, type Response } from 'express'
import { correlationService } from '../services/correlationService.js'
import { store } from '../db/store.js'
import type { MetricQuery, MetricType } from '../../shared/types.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  const metricTypes = (req.query.metricTypes as string || 'cpu,memory,disk,network').split(',') as MetricType[]
  const serviceNames = req.query.serviceNames ? (req.query.serviceNames as string).split(',') : undefined
  const nodeIds = req.query.nodeIds ? (req.query.nodeIds as string).split(',') : undefined
  const startTime = req.query.startTime as string || new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const endTime = req.query.endTime as string || new Date().toISOString()
  const threshold = req.query.threshold ? parseFloat(req.query.threshold as string) : 0.7

  const query: MetricQuery = {
    metricTypes,
    serviceNames,
    nodeIds,
    startTime,
    endTime,
  }

  const result = correlationService.correlate(query, threshold)
  res.json(result)
})

router.get('/synchronous', (req: Request, res: Response): void => {
  const startTime = req.query.startTime as string || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const endTime = req.query.endTime as string || new Date().toISOString()

  const anomalies = store.queryAnomalies({ startTime, endTime }).anomalies
  const synchronous = correlationService.findSynchronousAnomalies(anomalies)

  res.json({ synchronousAnomalies: synchronous })
})

router.post('/pattern', (req: Request, res: Response): void => {
  const series = req.body.series
  if (!series || !Array.isArray(series)) {
    res.status(400).json({ error: 'Series array is required' })
    return
  }

  const pattern = correlationService.detectPattern(series)
  res.json({ pattern })
})

export default router

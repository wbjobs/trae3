import { Router, type Request, type Response } from 'express'
import { queryMetrics } from '../services/metricService.js'
import { store } from '../db/store.js'
import { streamingService } from '../services/streamingService.js'
import type { MetricQuery, MetricType, DataTier } from '../../shared/types.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  const metricTypes = (req.query.metricTypes as string || 'cpu,memory,disk,network').split(',') as MetricType[]
  const serviceNames = req.query.serviceNames ? (req.query.serviceNames as string).split(',') : undefined
  const nodeIds = req.query.nodeIds ? (req.query.nodeIds as string).split(',') : undefined
  const startTime = req.query.startTime as string || new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const endTime = req.query.endTime as string || new Date().toISOString()
  const interval = req.query.interval as MetricQuery['interval'] | undefined
  const tier = req.query.tier as DataTier | undefined

  const query: MetricQuery = { metricTypes, serviceNames, nodeIds, startTime, endTime, interval, tier }
  const series = queryMetrics(query)

  res.json({ series })
})

router.get('/health', (_req: Request, res: Response): void => {
  const health = store.getHealthSummary()
  res.json({ health })
})

router.get('/windows', (req: Request, res: Response): void => {
  const windowSize = req.query.windowSize as string | undefined
  const windows = streamingService.getWindowAggregates(windowSize)
  res.json({ windows })
})

router.get('/stream-stats', (_req: Request, res: Response): void => {
  const stats = streamingService.getStreamStats()
  res.json({ stats })
})

export default router

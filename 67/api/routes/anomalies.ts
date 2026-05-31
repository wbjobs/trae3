import { Router, type Request, type Response } from 'express'
import { queryAnomalies, getAnomalyDetail } from '../services/anomalyService.js'
import type { AnomalyQuery, Severity, MetricType } from '../../shared/types.js'

const router = Router()

router.get('/', (req: Request, res: Response): void => {
  const query: AnomalyQuery = {
    severity: req.query.severity as Severity | undefined,
    metricType: req.query.metricType as MetricType | undefined,
    serviceName: req.query.serviceName as string | undefined,
    startTime: req.query.startTime as string | undefined,
    endTime: req.query.endTime as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string, 10) : undefined,
  }

  const result = queryAnomalies(query)
  res.json(result)
})

router.get('/:id', (req: Request, res: Response): void => {
  const detail = getAnomalyDetail(req.params.id)
  if (!detail) {
    res.status(404).json({ error: 'Anomaly not found' })
    return
  }
  res.json(detail)
})

export default router

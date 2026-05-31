import { Router, type Request, type Response } from 'express'
import { traceService } from '../services/traceService.js'

const router = Router()

router.get('/graph', (_req: Request, res: Response): void => {
  const graph = traceService.getGraph()
  res.json(graph)
})

router.get('/:anomalyId', (req: Request, res: Response): void => {
  const anomalyId = req.params.anomalyId
  const result = traceService.traceAnomaly(anomalyId)

  if (!result) {
    res.status(404).json({ error: 'Anomaly not found' })
    return
  }

  res.json(result)
})

export default router

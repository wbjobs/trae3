import { Router, type Request, type Response } from 'express'
import { processDataPoint } from '../services/calculationService.js'
import type { DataPoint } from '../../shared/types.js'

const router = Router()

router.post('/push', (req: Request, res: Response): void => {
  const dp: DataPoint = req.body

  if (!dp.metricType || !dp.serviceName || !dp.nodeId || dp.value === undefined) {
    res.status(400).json({ error: 'Missing required fields: metricType, serviceName, nodeId, value' })
    return
  }

  const result = processDataPoint(dp)

  res.json({
    detected: result.detectionResult.newAnomalies.length > 0,
    anomalies: result.detectionResult.newAnomalies,
    resolved: result.detectionResult.resolvedAnomalies,
  })
})

export default router

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import metricsRoutes from './routes/metrics.js'
import anomaliesRoutes from './routes/anomalies.js'
import servicesRoutes from './routes/services.js'
import dataRoutes from './routes/data.js'
import streamingRoutes from './routes/streaming.js'
import traceRoutes from './routes/trace.js'
import correlationRoutes from './routes/correlation.js'
import storageRoutes from './routes/storage.js'

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/metrics', metricsRoutes)
app.use('/api/anomalies', anomaliesRoutes)
app.use('/api/services', servicesRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/stream', streamingRoutes)
app.use('/api/trace', traceRoutes)
app.use('/api/correlation', correlationRoutes)
app.use('/api/storage', storageRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app

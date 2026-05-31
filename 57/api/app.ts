
import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initDatabase, getDb } from './db/database.js'
import { seedDatabase } from './db/seed.js'
import dataRoutes from './routes/data.js'
import indicatorRoutes from './routes/indicators.js'
import anomalyRoutes from './routes/anomaly.js'
import stationRoutes from './routes/stations.js'
import dashboardRoutes from './routes/dashboard.js'
import streamRoutes from './routes/stream.js'
import extremeRoutes from './routes/extreme.js'
import watershedRoutes from './routes/watershed.js'

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

initDatabase()

const stationCount = (getDb().prepare('SELECT COUNT(*) as count FROM stations').get() as { count: number }).count
if (stationCount === 0) {
  seedDatabase()
}

app.use('/api/data', dataRoutes)
app.use('/api/indicators', indicatorRoutes)
app.use('/api/anomaly', anomalyRoutes)
app.use('/api/stations', stationRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/stream', streamRoutes)
app.use('/api/extreme', extremeRoutes)
app.use('/api/watershed', watershedRoutes)

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

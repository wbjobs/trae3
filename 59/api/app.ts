import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import deviceRoutes from './routes/devices.js'
import alertRoutes from './routes/alerts.js'
import statsRoutes from './routes/stats.js'
import systemRoutes from './routes/system.js'
import archiveRoutes from './routes/archive.js'
import { seedDatabase } from './database/seed.js'

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

seedDatabase()

app.use('/api/devices', deviceRoutes)
app.use('/api/alerts', alertRoutes)
app.use('/api/stats', statsRoutes)
app.use('/api/system', systemRoutes)
app.use('/api/archive', archiveRoutes)

app.use('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({ success: true, message: 'ok' })
})

app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({ success: false, error: 'Server internal error' })
})

app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'API not found' })
})

export default app

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { initDatabase } from './db/init.js'
import authRoutes from './routes/auth.js'
import sampleRoutes from './routes/samples.js'
import transferRoutes from './routes/transfers.js'
import labRoutes from './routes/labs.js'
import statisticsRoutes from './routes/statistics.js'
import messageRoutes from './routes/messages.js'
import archiveRoutes from './routes/archives.js'
import alertRoutes from './routes/alerts.js'

dotenv.config()

initDatabase()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/samples', sampleRoutes)
app.use('/api/transfers', transferRoutes)
app.use('/api/labs', labRoutes)
app.use('/api/statistics', statisticsRoutes)
app.use('/api/messages', messageRoutes)
app.use('/api/archives', archiveRoutes)
app.use('/api/alerts', alertRoutes)

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

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import pipeRoutes from './routes/pipes.js'
import crossSectionRoutes from './routes/cross-section.js'
import alarmRoutes from './routes/alarms.js'
import inspectionRoutes from './routes/inspections.js'
import pathPlanningRoutes from './routes/path-planning.js'
import annotationRoutes from './routes/annotations.js'
import collabRoutes from './routes/collab.js'
import nodeRoutes from './routes/nodes.js'
import maintenanceRoutes from './routes/maintenance.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/pipes', pipeRoutes)
app.use('/api/pipes', crossSectionRoutes)
app.use('/api/alarms', alarmRoutes)
app.use('/api/inspections', inspectionRoutes)
app.use('/api/path-planning', pathPlanningRoutes)
app.use('/api/annotations', annotationRoutes)
app.use('/api/collab', collabRoutes)
app.use('/api/nodes', nodeRoutes)
app.use('/api/maintenance', maintenanceRoutes)

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

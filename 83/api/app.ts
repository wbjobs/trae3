/**
 * 拓片数字化管理系统 API 服务器
 */

import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { initAllSchemas } from './db/schema.js'
import { closeDatabases } from './db/index.js'

import authRoutes from './routes/auth.js'
import uploadRoutes from './routes/upload.js'
import rubbingsRoutes from './routes/rubbings.js'
import searchRoutes from './routes/search.js'
import filesRoutes from './routes/files.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

initAllSchemas()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/rubbings', rubbingsRoutes)
app.use('/api/search', searchRoutes)
app.use('/api/files', filesRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
      timestamp: new Date().toISOString(),
    })
  },
)

app.use('/api/storage/thumbnails', express.static(path.join(__dirname, '../storage/thumbnails')))
app.use('/api/storage/attachments', express.static(path.join(__dirname, '../storage/attachments')))

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    message: '服务器内部错误',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: 'API 接口不存在',
  })
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing databases...')
  closeDatabases()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, closing databases...')
  closeDatabases()
  process.exit(0)
})

export default app

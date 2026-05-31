import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const env = process.env.NODE_ENV || 'development'
const envPath = path.resolve(__dirname, '../../.env.' + env)

dotenv.config({ path: envPath })

export const config = {
  env,
  port: Number(process.env.PORT) || 3000,
  jwt: {
    secret: process.env.JWT_SECRET || 'node-trace-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'root',
    name: process.env.DB_NAME || 'node_trace_dev'
  },
  logLevel: process.env.LOG_LEVEL || 'debug',
  collectorUrl: process.env.COLLECTOR_URL || 'http://127.0.0.1:3001',
  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX) || 100,
    window: Number(process.env.RATE_LIMIT_WINDOW) || 60000
  },
  serviceName: 'gateway',
  publicPaths: ['/api/auth/login', '/health']
}

export default config

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
  port: Number(process.env.PORT) || 3001,
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:3000',
  collectInterval: Number(process.env.COLLECT_INTERVAL) || 30000,
  logLevel: process.env.LOG_LEVEL || 'debug',
  apiTimeout: Number(process.env.API_TIMEOUT) || 5000,
  maxRetry: Number(process.env.MAX_RETRY) || 3,
  serviceName: 'collector'
}

export default config

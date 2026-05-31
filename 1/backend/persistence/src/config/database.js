import { Sequelize } from 'sequelize'
import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const env = process.env.NODE_ENV || 'development'
const envPath = path.resolve(__dirname, '../../.env.' + env)

dotenv.config({ path: envPath })

const config = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root',
  database: process.env.DB_NAME || 'node_trace_dev',
  dialect: 'mysql',
  timezone: '+08:00',
  pool: {
    max: Number(process.env.DB_POOL_MAX) || 20,
    min: Number(process.env.DB_POOL_MIN) || 5,
    idle: Number(process.env.DB_POOL_IDLE) || 30000,
    acquire: Number(process.env.DB_POOL_ACQUIRE) || 30000,
    evict: Number(process.env.DB_POOL_EVICT) || 10000
  },
  retry: {
    max: 3,
    match: [/Deadlock/i, /Connection.*timed.out/i]
  },
  define: {
    charset: 'utf8mb4',
    collate: 'utf8mb4_unicode_ci'
  },
  benchmark: process.env.LOG_LEVEL === 'debug',
  logging: process.env.LOG_LEVEL === 'debug' ? console.log : false
}

const sequelize = new Sequelize(
  config.database,
  config.username,
  config.password,
  {
    host: config.host,
    port: config.port,
    dialect: config.dialect,
    timezone: config.timezone,
    pool: config.pool,
    retry: config.retry,
    define: config.define,
    benchmark: config.benchmark,
    logging: config.logging
  }
)

export { sequelize, config }
export default sequelize

import express from 'express'
import cors from 'cors'
import config from './config/index'

import gatewayRoutes from './src/routes/gateway'
import dataRoutes from './src/routes/data'
import controlRoutes from './src/routes/control'
import alarmRoutes from './src/routes/alarm'

const app = express()

app.use(cors({ origin: config.corsOrigin }))
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'ok',
    environment: config.env,
    timestamp: new Date().toISOString(),
  })
})

app.use('/api/gateway', gatewayRoutes)
app.use('/api/data', dataRoutes)
app.use('/api/control', controlRoutes)
app.use('/api/alarm', alarmRoutes)

app.get('/api/config', (req, res) => {
  res.json({
    environment: config.env,
    simulatorEnabled: config.dataSimulator.enabled,
    simulatorInterval: config.dataSimulator.interval,
  })
})

app.use((error, req, res, next) => {
  console.error('服务器错误:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
    message: error.message,
  })
})

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app

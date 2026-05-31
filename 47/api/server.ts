import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import app from './app.js'
import { handleConnection, broadcastMessage } from './ws-handler.js'
import { insertPvData, insertAnomalyEvent, getRecentAverage, updateDeviceStatus, getDevices, getKpi, flushColdSlices, getRecentPvData } from './db.js'
import { generateDataPoint } from './simulator.js'
import { detectAnomalies, createSlidingWindow } from './compute.js'
import { updateForecast } from './forecast.js'
import { ARRAY_IDS, SLIDING_WINDOW_SIZE } from '../shared/types.js'

const PORT = process.env.PORT || 3001

const server = createServer(app)

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', handleConnection)

const SIMULATION_INTERVAL = 2000
const FORECAST_INTERVAL = 5
const COLD_FLUSH_INTERVAL = 60000

const slidingWindows = new Map<string, ReturnType<typeof createSlidingWindow>>()
let forecastCounter = 0

for (const arrayId of ARRAY_IDS) {
  slidingWindows.set(arrayId, createSlidingWindow(SLIDING_WINDOW_SIZE))
}

const simTimer = setInterval(async () => {
  const now = Date.now()
  forecastCounter++

  for (const arrayId of ARRAY_IDS) {
    const dataPoint = generateDataPoint(arrayId, now)
    await insertPvData(dataPoint)

    const window = slidingWindows.get(arrayId)!
    window.push(dataPoint)

    broadcastMessage('realtime_data', dataPoint)

    const windowMetrics = window.getMetrics()
    broadcastMessage('window_metrics', { arrayId, metrics: windowMetrics })

    const windowHistory = window.getHistory()
    const anomaly = detectAnomalies(dataPoint, windowHistory)
    if (anomaly) {
      insertAnomalyEvent(anomaly)
      broadcastMessage('anomaly_event', anomaly)
    }
  }

  const kpi = getKpi()
  broadcastMessage('metric_update', kpi)

  if (forecastCounter >= FORECAST_INTERVAL) {
    forecastCounter = 0
    for (const arrayId of ARRAY_IDS) {
      const history = getRecentPvData(20).filter(p => p.arrayId === arrayId)
      if (history.length > 0) {
        const forecast = updateForecast(arrayId, history)
        broadcastMessage('forecast_update', forecast)
      }
    }
  }

  if (Math.random() < 0.05) {
    const allDevices = getDevices()
    if (allDevices.length > 0) {
      const dev = allDevices[Math.floor(Math.random() * allDevices.length)]
      const statuses: Array<'online' | 'offline' | 'fault'> = ['online', 'offline', 'fault']
      const newStatus = statuses[Math.floor(Math.random() * statuses.length)]
      updateDeviceStatus(dev.deviceId, newStatus)
      broadcastMessage('device_status', { ...dev, status: newStatus, lastUpdate: now })
    }
  }
}, SIMULATION_INTERVAL)

const coldFlushTimer = setInterval(async () => {
  await flushColdSlices()
}, COLD_FLUSH_INTERVAL)

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
  console.log(`WebSocket server on path /ws`)
})

const shutdown = (signal: string) => {
  console.log(`${signal} signal received`)
  clearInterval(simTimer)
  clearInterval(coldFlushTimer)
  wss.close()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

export default app

import { createServer } from 'http'
import app from './app.js'
import { initDatabase, aggregateHourlyData, aggregateDailyData, purgeOldData, startHistoryFlush, stopHistoryFlush } from './database.js'
import { initCache, startSimulator, setAlarmCallback, setStatusChangeCallback } from './realtime-cache.js'
import { initWebSocket, broadcastAlarm, closeWebSocket } from './websocket.js'
import { getDb } from './database.js'

const PORT = process.env.PORT || 3001

const server = createServer(app)

initDatabase()
initCache()

setAlarmCallback((alarm) => {
  broadcastAlarm(alarm)
})

setStatusChangeCallback((pipeId, status) => {
  const db = getDb()
  db.prepare('UPDATE pipe_segment SET status = ? WHERE id = ?').run(status, pipeId)
})

initWebSocket(server)
startSimulator()
startHistoryFlush()

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
  console.log(`WebSocket server ready on /ws`)
  scheduleAggregationJobs()
})

let hourlyTimer: ReturnType<typeof setInterval> | null = null
let dailyTimer: ReturnType<typeof setInterval> | null = null
let purgeTimer: ReturnType<typeof setInterval> | null = null

function scheduleAggregationJobs(): void {
  const now = Date.now()

  const nextHour = Math.ceil(now / 3600000) * 3600000
  const delayToHour = nextHour - now
  setTimeout(() => {
    aggregateHourlyData()
    hourlyTimer = setInterval(aggregateHourlyData, 3600000)
  }, delayToHour)
  console.log(`[Scheduler] Hourly aggregation scheduled in ${Math.round(delayToHour / 60000)} minutes`)

  const nextMidnight = new Date()
  nextMidnight.setHours(24, 0, 0, 0)
  const delayToMidnight = nextMidnight.getTime() - now
  setTimeout(() => {
    aggregateDailyData()
    dailyTimer = setInterval(aggregateDailyData, 86400000)
  }, delayToMidnight)
  console.log(`[Scheduler] Daily aggregation scheduled in ${Math.round(delayToMidnight / 3600000)} hours`)

  const next2AM = new Date()
  next2AM.setHours(next2AM.getHours() >= 2 ? 26 : 2, 0, 0, 0)
  const delayTo2AM = next2AM.getTime() - now
  setTimeout(() => {
    purgeOldData()
    purgeTimer = setInterval(purgeOldData, 86400000)
  }, delayTo2AM)
  console.log(`[Scheduler] Data purge scheduled in ${Math.round(delayTo2AM / 3600000)} hours`)
}

function cleanupTimers(): void {
  if (hourlyTimer) clearInterval(hourlyTimer)
  if (dailyTimer) clearInterval(dailyTimer)
  if (purgeTimer) clearInterval(purgeTimer)
  stopHistoryFlush()
}

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  cleanupTimers()
  closeWebSocket()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  cleanupTimers()
  closeWebSocket()
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app

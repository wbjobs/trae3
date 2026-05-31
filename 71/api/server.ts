import app from './app.js'
import { init as initWs, broadcast, broadcastToDevice } from './websocket.js'
import { start as startConnectionManager, onParamsUpdate, onStatusChange } from './services/connectionManager.js'
import { checkThresholds } from './services/alertService.js'
import { getDeviceById } from './services/deviceService.js'

const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
})

initWs(server)

onParamsUpdate((deviceId, params) => {
  broadcastToDevice(deviceId, 'device:params', { deviceId, params })
  const alerts = checkThresholds(deviceId, params)
  for (const alert of alerts) {
    broadcast('device:alert', alert)
  }
})

onStatusChange((deviceId, status) => {
  const device = getDeviceById(deviceId)
  broadcast('device:status', { deviceId, status, device })
})

startConnectionManager()

process.on('SIGTERM', () => {
  console.log('SIGTERM signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('SIGINT signal received')
  server.close(() => {
    console.log('Server closed')
    process.exit(0)
  })
})

export default app

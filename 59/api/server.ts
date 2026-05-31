import app from './app.js'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { setupWebSocket } from './websocket.js'
import gatewayAdapter from './services/gatewayAdapter.js'
import cleanupService from './services/cleanupService.js'

const PORT = process.env.PORT || 3001

const server = createServer(app)
const wss = new WebSocketServer({ server, path: '/ws' })

setupWebSocket(wss)

cleanupService.startCleanup()

gatewayAdapter.startPolling(
  5000,
  () => {},
  () => {},
)

server.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
})

process.on('SIGTERM', () => {
  gatewayAdapter.stopPolling()
  cleanupService.stopCleanup()
  server.close(() => {
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  gatewayAdapter.stopPolling()
  cleanupService.stopCleanup()
  server.close(() => {
    process.exit(0)
  })
})

export default app

import app from './app.js'
import { setupWebSocket } from './websocket.js'
import { startSimulator } from './simulator.js'

const PORT = process.env.PORT || 3001

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`)
  setupWebSocket(server)
  startSimulator()
})

server.on('error', (err: Error) => {
  console.error('Server error:', err.message)
})

process.on('uncaughtException', (err: Error) => {
  console.error('Uncaught exception:', err.message)
})

process.on('unhandledRejection', (reason: unknown) => {
  console.error('Unhandled rejection:', reason)
})

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

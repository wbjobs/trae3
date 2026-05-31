import { createServer } from 'http'
import app from './app'
import config from './config/index'
import { webSocketService } from './src/services/WebSocketService'
import { dataSimulator } from './src/services/DataSimulator'
import { getSQLiteDB } from './src/database/sqlite'
import { testInfluxConnection } from './src/database/influxdb'

const httpServer = createServer(app)

const initServices = async () => {
  console.log('='.repeat(60))
  console.log('船舶舱内传感数据监控平台 - 后端服务启动')
  console.log('='.repeat(60))
  console.log(`部署环境: ${config.env}`)
  console.log(`监听端口: ${config.port}`)
  console.log(`WebSocket路径: ${config.websocket.path}`)
  console.log('')

  console.log('初始化 SQLite 数据库...')
  try {
    getSQLiteDB()
    console.log('✓ SQLite 数据库初始化成功')
  } catch (error) {
    console.error('✗ SQLite 数据库初始化失败:', error)
  }

  console.log('连接 InfluxDB...')
  try {
    const influxConnected = await testInfluxConnection()
    if (influxConnected) {
      console.log('✓ InfluxDB 连接成功')
    } else {
      console.log('⚠ InfluxDB 未连接，使用模拟数据模式')
    }
  } catch (error) {
    console.log('⚠ InfluxDB 连接失败，使用模拟数据模式')
  }

  console.log('初始化 WebSocket 服务...')
  webSocketService.init(httpServer)
  console.log('✓ WebSocket 服务已启动')

  if (config.dataSimulator.enabled) {
    console.log(`启动数据模拟器 (间隔: ${config.dataSimulator.interval}ms)...`)
    dataSimulator.start()
    console.log('✓ 数据模拟器已启动')
  } else {
    console.log('数据模拟器已禁用')
  }

  console.log('')
  console.log('='.repeat(60))
  console.log('服务启动完成!')
  console.log(`HTTP 服务: http://${config.host}:${config.port}`)
  console.log(`WebSocket: ws://${config.host}:${config.port}${config.websocket.path}`)
  console.log('='.repeat(60))
}

httpServer.listen(config.port, () => {
  initServices()
})

const gracefulShutdown = () => {
  console.log('\n正在关闭服务...')
  
  dataSimulator.stop()
  webSocketService.shutdown()
  
  httpServer.close(() => {
    console.log('服务已关闭')
    process.exit(0)
  })
}

process.on('SIGTERM', gracefulShutdown)
process.on('SIGINT', gracefulShutdown)

export default httpServer

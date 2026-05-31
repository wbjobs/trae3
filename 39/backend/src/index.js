import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import dotenv from 'dotenv'
import DataCollector from './modules/dataCollector.js'
import CommandHandler from './modules/commandHandler.js'
import RealtimeDB from './modules/realtimeDB.js'
import UserManager from './modules/userManager.js'
import CommandQueue from './modules/commandQueue.js'
import AlarmArchiver from './modules/alarmArchiver.js'
import PermissionManager from './modules/permissionManager.js'

dotenv.config()

const app = express()
const httpServer = createServer(app)

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
})

app.use(cors())
app.use(express.json())

const db = new RealtimeDB()
const userManager = new UserManager()
const dataCollector = new DataCollector(db)
const commandHandler = new CommandHandler(db, io)
const commandQueue = new CommandQueue({ maxConcurrent: 5, maxRetries: 2 })
const permissionManager = new PermissionManager()
const alarmArchiver = new AlarmArchiver(db)

const lastDeviceStates = new Map()
const BATCH_INTERVAL = 100
let batchUpdates = []
let batchTimer = null

function initCommandQueue() {
  const commands = ['start', 'stop', 'setSpeed', 'setMode', 'maintenance']
  const priorities = {
    start: 10,
    stop: 15,
    setSpeed: 5,
    setMode: 5,
    maintenance: 20
  }
  
  commands.forEach(cmd => {
    commandQueue.registerCommand(cmd, async (deviceId, params) => {
      return commandHandler.execute(deviceId, cmd, params)
    }, { priority: priorities[cmd] })
  })
  
  commandQueue.on('completed', (task) => {
    const device = db.getDevice(task.deviceId)
    io.emit('command:response', {
      taskId: task.id,
      success: true,
      result: task.result,
      device
    })
    if (device) {
      queueDeviceUpdate(device)
    }
  })
  
  commandQueue.on('failed', (task) => {
    io.emit('command:response', {
      taskId: task.id,
      success: false,
      error: task.error,
      deviceId: task.deviceId,
      command: task.command
    })
  })
}

function queueDeviceUpdate(device) {
  const lastState = lastDeviceStates.get(device.id)
  
  if (lastState) {
    const changes = {}
    let hasChanges = false
    
    Object.keys(device.params || {}).forEach(key => {
      if (lastState.params?.[key] !== device.params[key]) {
        changes[key] = device.params[key]
        hasChanges = true
      }
    })
    
    if (device.status !== lastState.status) {
      changes.status = device.status
      hasChanges = true
    }
    
    if (!hasChanges) return
    
    batchUpdates.push({
      id: device.id,
      type: 'incremental',
      changes,
      timestamp: Date.now()
    })
  } else {
    batchUpdates.push({
      id: device.id,
      type: 'full',
      data: device,
      timestamp: Date.now()
    })
  }
  
  lastDeviceStates.set(device.id, JSON.parse(JSON.stringify(device)))
  
  if (!batchTimer) {
    batchTimer = setTimeout(sendBatchUpdates, BATCH_INTERVAL)
  }
}

function sendBatchUpdates() {
  if (batchUpdates.length === 0) {
    batchTimer = null
    return
  }
  
  const updates = [...batchUpdates]
  batchUpdates = []
  batchTimer = null
  
  if (updates.length === 1) {
    const update = updates[0]
    io.emit('device:update', update.type === 'full' ? update.data : {
      id: update.id,
      ...update.changes
    })
  } else {
    io.emit('devices:batch', {
      count: updates.length,
      updates,
      timestamp: Date.now()
    })
  }
}

db.init().then(() => {
  console.log('✅ 实时数据库初始化完成')
  
  const devices = db.getAllDevices()
  devices.forEach(d => {
    lastDeviceStates.set(d.id, JSON.parse(JSON.stringify(d)))
  })
  
  initCommandQueue()
  console.log('📋 指令队列已初始化')
  
  dataCollector.start()
  console.log('📡 数据采集模块已启动')
  
  alarmArchiver.start()
  console.log('📦 告警归档服务已启动')
})

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    connectedUsers: userManager.getUserCount(),
    queueStats: commandQueue.getStats(),
    archiveStats: alarmArchiver.getArchiveStats()
  })
})

app.get('/api/devices', (req, res) => {
  const devices = db.getAllDevices()
  res.json({ devices })
})

app.get('/api/devices/:id', (req, res) => {
  const device = db.getDevice(req.params.id)
  if (device) {
    res.json({ device })
  } else {
    res.status(404).json({ error: 'Device not found' })
  }
})

app.get('/api/alarms', (req, res) => {
  const alarms = db.getAlarms()
  res.json({ alarms })
})

app.get('/api/alarms/archives', (req, res) => {
  res.json(alarmArchiver.getArchiveStats())
})

app.get('/api/alarms/archives/:date', (req, res) => {
  const { date } = req.params
  const alarms = alarmArchiver.queryArchive(date, req.query)
  res.json({ alarms })
})

app.post('/api/alarms/archive', (req, res) => {
  const { hours = 24 } = req.body
  const result = alarmArchiver.manualArchive(hours)
  res.json(result)
})

app.post('/api/command', (req, res) => {
  try {
    const { deviceId, command, params, userId } = req.body
    
    if (!deviceId || !command) {
      return res.status(400).json({ 
        success: false, 
        error: '缺少必要参数: deviceId 和 command' 
      })
    }
    
    const permCheck = permissionManager.canExecuteCommand(userId || 'system', command)
    if (!permCheck.allowed) {
      return res.status(403).json({
        success: false,
        error: permCheck.reason
      })
    }
    
    const result = commandQueue.enqueue(deviceId, command, params, userId || 'system')
    res.json(result)
  } catch (error) {
    console.error('API指令执行错误:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message 
    })
  }
})

app.get('/api/commands/:taskId', (req, res) => {
  const status = commandQueue.getStatus(req.params.taskId)
  if (status) {
    res.json({ task: status })
  } else {
    res.status(404).json({ error: '任务不存在' })
  }
})

app.get('/api/commands/stats', (req, res) => {
  res.json(commandQueue.getStats())
})

app.get('/api/users', (req, res) => {
  res.json({ users: permissionManager.getAllUsers() })
})

app.post('/api/users', (req, res) => {
  const { userId, name, role } = req.body
  const user = permissionManager.addUser(userId, name, role)
  res.json({ success: true, user })
})

app.put('/api/users/:userId/role', (req, res) => {
  const { userId } = req.params
  const { role, operatorId } = req.body
  const result = permissionManager.updateUserRole(userId, role, operatorId)
  res.json(result)
})

app.get('/api/audit', (req, res) => {
  const logs = permissionManager.getAuditLogs(req.query)
  res.json({ logs, stats: permissionManager.getAuditStats() })
})

app.delete('/api/alarms/:alarmId', (req, res) => {
  const { alarmId } = req.params
  const removed = db.removeAlarm(alarmId)
  
  if (removed) {
    io.emit('alarm:acknowledged', { alarmId })
    res.json({ success: true })
  } else {
    res.status(404).json({ success: false, error: '告警不存在' })
  }
})

app.delete('/api/alarms', (req, res) => {
  db.clearAllAlarms()
  io.emit('alarms:cleared')
  res.json({ success: true, message: '所有告警已清理' })
})

io.on('connection', (socket) => {
  const { userId, userName, userRole = 'operator' } = socket.handshake.query
  
  console.log(`🔌 用户连接: ${userName} (${userId}) 角色: ${userRole}`)
  
  const user = permissionManager.addUser(userId, userName, userRole)
  userManager.addUser(userId, userName, socket.id)
  
  socket.emit('user:current', user)
  socket.emit('devices:initial', db.getAllDevices())
  socket.emit('users:update', userManager.getAllUsers())
  
  socket.broadcast.emit('users:update', userManager.getAllUsers())
  
  socket.on('user:selectDevice', ({ deviceId }) => {
    userManager.setSelectedDevice(userId, deviceId)
    socket.broadcast.emit('users:update', userManager.getAllUsers())
  })
  
  socket.on('command:send', ({ deviceId, command, params, timestamp }) => {
    try {
      const permCheck = permissionManager.canExecuteCommand(userId, command)
      
      if (!permCheck.allowed) {
        socket.emit('command:response', {
          success: false,
          deviceId,
          command,
          requestTimestamp: timestamp,
          error: permCheck.reason
        })
        return
      }
      
      const result = commandQueue.enqueue(deviceId, command, params, userId)
      
      socket.emit('command:queued', {
        ...result,
        requestTimestamp: timestamp,
        deviceId,
        command
      })
      
      console.log(`📋 指令已入队: ${command} -> ${deviceId} (用户: ${userName})`)
    } catch (error) {
      console.error(`❌ 指令入队异常: ${command} -> ${deviceId}`, error)
      socket.emit('command:response', { 
        success: false,
        deviceId,
        command,
        requestTimestamp: timestamp,
        error: error.message
      })
    }
  })
  
  socket.on('alarm:acknowledge', ({ alarmId }) => {
    if (permissionManager.hasPermission(userId, 'alarm:acknowledge')) {
      const removed = db.removeAlarm(alarmId)
      if (removed) {
        io.emit('alarm:acknowledged', { alarmId })
        permissionManager.logAudit('alarm:acknowledge', userId, { alarmId })
        console.log(`✅ 告警已确认: ${alarmId} (用户: ${userName})`)
      }
    }
  })

  socket.on('alarm:clearAll', () => {
    if (permissionManager.hasPermission(userId, 'alarm:delete')) {
      db.clearAllAlarms()
      io.emit('alarms:cleared')
      permissionManager.logAudit('alarm:clearAll', userId, {})
      console.log('🗑️  所有告警已清理')
    }
  })
  
  socket.on('disconnect', () => {
    console.log(`🔌 用户断开: ${userName} (${userId})`)
    userManager.removeUser(userId)
    permissionManager.removeUser(userId)
    io.emit('users:update', userManager.getAllUsers())
  })
})

dataCollector.on('deviceUpdate', (device) => {
  queueDeviceUpdate(device)
})

dataCollector.on('alarm', (alarm) => {
  io.emit('alarm:new', alarm)
})

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`
🚀 工业产线数字孪生系统后端服务已启动
📍 服务地址: http://localhost:${PORT}
🔌 WebSocket: ws://localhost:${PORT}
📊 API接口: http://localhost:${PORT}/api

📦 已加载模块:
   ✅ 实时数据库
   ✅ 数据采集模块  
   ✅ 指令队列引擎 (优先级+并发控制)
   ✅ 权限管理系统 (4级角色)
   ✅ 告警归档服务 (冷热分离)
   ✅ 操作审计日志
  `)
})

export { io, db, userManager, dataCollector, commandHandler, commandQueue, permissionManager, alarmArchiver }

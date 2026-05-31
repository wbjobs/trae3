import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import config from '../../config'
import { sensorDataService } from './SensorDataService'
import { alarmService } from './AlarmService'
import { deviceControlService } from './DeviceControlService'

type SensorType = 'temperature' | 'humidity' | 'level' | 'pressure'
type DeviceType = 'fan' | 'pump' | 'valve' | 'heater' | 'cooler'
type DeviceStatus = 'on' | 'off' | 'error'
type AlarmLevel = 'info' | 'warning' | 'critical'
type AlarmStatus = 'pending' | 'acknowledged' | 'resolved'

interface SensorData {
  cabinId: string
  sensorId: string
  sensorType: SensorType
  value: number
  unit: string
  timestamp: Date
}

interface Device {
  id: string
  cabinId: string
  type: DeviceType
  name: string
  status: DeviceStatus
  currentValue: number
  targetValue?: number
}

interface AlarmLog {
  id: string
  ruleId: string
  sensorId: string
  triggerValue: number
  level: AlarmLevel
  timestamp: Date
  status: AlarmStatus
  handlerId?: string
  resolvedAt?: Date
}

interface IncrementalUpdate {
  sensorData: SensorData[]
  deviceUpdates: Device[]
}

export class WebSocketService {
  private io: Server | null = null
  private connectedClients: Set<string> = new Set()
  private incrementalBuffer: IncrementalUpdate = {
    sensorData: [],
    deviceUpdates: [],
  }
  private broadcastTimer: ReturnType<typeof setTimeout> | null = null
  private readonly BROADCAST_INTERVAL_MS = 500
  private pendingAlarmBroadcast = false
  private alarmBroadcastTimer: ReturnType<typeof setTimeout> | null = null
  private readonly ALARM_BROADCAST_INTERVAL_MS = 1000

  init(httpServer: HttpServer) {
    this.io = new Server(httpServer, {
      path: config.websocket.path,
      cors: config.websocket.cors,
    })

    this.io.on('connection', this.handleConnection.bind(this))
    
    alarmService.setAlarmCallback(this.onAlarmTriggered.bind(this))
    deviceControlService.setControlCallback(this.onDeviceControl.bind(this))

    console.log('WebSocket 服务已启动')
  }

  private handleConnection(socket: Socket) {
    console.log(`客户端连接: ${socket.id}`)
    this.connectedClients.add(socket.id)

    socket.emit('welcome', {
      message: '已连接到船舶监控系统',
      timestamp: new Date().toISOString(),
      clientCount: this.connectedClients.size,
    })

    socket.on('subscribe:all', () => {
      socket.join('all')
      this.sendInitialData(socket)
    })

    socket.on('subscribe:cabin', (cabinId: string) => {
      socket.join(`cabin:${cabinId}`)
      this.sendCabinData(socket, cabinId)
    })

    socket.on('unsubscribe:cabin', (cabinId: string) => {
      socket.leave(`cabin:${cabinId}`)
    })

    socket.on('request:realtime', () => {
      this.sendInitialData(socket)
    })

    socket.on('device:control', (command: any) => {
      const result = deviceControlService.executeCommand({
        ...command,
        operatorId: socket.id,
      })
      socket.emit('device:control:result', result)
    })

    socket.on('alarm:acknowledge', (alarmId: string) => {
      alarmService.acknowledgeAlarm(alarmId, socket.id)
      this.scheduleAlarmBroadcast()
    })

    socket.on('alarm:resolve', (alarmId: string) => {
      alarmService.resolveAlarm(alarmId, socket.id)
      this.scheduleAlarmBroadcast()
    })

    socket.on('disconnect', () => {
      console.log(`客户端断开: ${socket.id}`)
      this.connectedClients.delete(socket.id)
    })
  }

  private sendInitialData(socket: Socket) {
    const cabins = sensorDataService.getCabins()
    const sensors = sensorDataService.getSensors()
    const allSensorData = sensorDataService.getAllLatestData()
    const devices = deviceControlService.getDevices()
    const pendingAlarms = alarmService.getPendingAlarms()
    const linkageRules = deviceControlService.getLinkageRules()

    socket.emit('data:init', {
      cabins,
      sensors,
      sensorData: allSensorData,
      devices,
      pendingAlarms,
      linkageRules,
      stats: {
        environment: config.env,
        totalSensors: sensors.length,
        activeSensors: allSensorData.length,
        totalDevices: devices.length,
        activeDevices: devices.filter(d => d.status === 'on').length,
        activeAlarms: pendingAlarms.length,
        todayAlarms: alarmService.getTodayAlarmCount(),
        dataPointsToday: sensorDataService.getDataPointCount(),
      },
    })
  }

  private sendCabinData(socket: Socket, cabinId: string) {
    const cabinData = sensorDataService.getCabinLatestData(cabinId)
    const cabinDevices = deviceControlService.getDevicesByCabin(cabinId)

    socket.emit('data:cabin', {
      cabinId,
      sensorData: cabinData,
      devices: cabinDevices,
    })
  }

  queueSensorData(data: SensorData) {
    const existing = this.incrementalBuffer.sensorData.find(
      d => d.sensorId === data.sensorId
    )
    if (existing) {
      existing.value = data.value
      existing.timestamp = data.timestamp
    } else {
      this.incrementalBuffer.sensorData.push(data)
    }
    this.scheduleBroadcast()
  }

  queueBatchSensorData(dataArray: SensorData[]) {
    for (const data of dataArray) {
      const existing = this.incrementalBuffer.sensorData.find(
        d => d.sensorId === data.sensorId
      )
      if (existing) {
        existing.value = data.value
        existing.timestamp = data.timestamp
      } else {
        this.incrementalBuffer.sensorData.push(data)
      }
    }
    this.scheduleBroadcast()
  }

  broadcastSensorData(data: SensorData) {
    this.queueSensorData(data)
  }

  broadcastBatchSensorData(dataArray: SensorData[]) {
    this.queueBatchSensorData(dataArray)
  }

  private scheduleBroadcast() {
    if (this.broadcastTimer) return

    this.broadcastTimer = setTimeout(() => {
      this.flushBroadcast()
      this.broadcastTimer = null
    }, this.BROADCAST_INTERVAL_MS)
  }

  private flushBroadcast() {
    if (!this.io) return

    const buffer = this.incrementalBuffer
    this.incrementalBuffer = { sensorData: [], deviceUpdates: [] }

    if (buffer.sensorData.length > 0) {
      this.io.to('all').emit('data:batch', buffer.sensorData)

      const cabinGroups = new Map<string, SensorData[]>()
      buffer.sensorData.forEach(data => {
        if (!cabinGroups.has(data.cabinId)) {
          cabinGroups.set(data.cabinId, [])
        }
        cabinGroups.get(data.cabinId)!.push(data)
      })

      cabinGroups.forEach((data, cabinId) => {
        this.io!.to(`cabin:${cabinId}`).emit('data:cabin:batch', { cabinId, data })
      })
    }

    if (buffer.deviceUpdates.length > 0) {
      buffer.deviceUpdates.forEach(device => {
        this.io.to('all').emit('device:update', device)
        this.io.to(`cabin:${device.cabinId}`).emit('device:update', device)
      })
    }
  }

  private onAlarmTriggered(alarm: AlarmLog) {
    if (!this.io) return
    this.io.to('all').emit('alarm:new', alarm)
  }

  private scheduleAlarmBroadcast() {
    if (this.alarmBroadcastTimer) return

    this.alarmBroadcastTimer = setTimeout(() => {
      this.flushAlarmBroadcast()
      this.alarmBroadcastTimer = null
    }, this.ALARM_BROADCAST_INTERVAL_MS)
  }

  private flushAlarmBroadcast() {
    if (!this.io) return
    const pendingAlarms = alarmService.getPendingAlarms()
    this.io.to('all').emit('alarm:update', pendingAlarms)
  }

  private broadcastAlarmUpdate() {
    this.scheduleAlarmBroadcast()
  }

  private onDeviceControl(deviceId: string, action: string, value?: number) {
    if (!this.io) return
    const device = deviceControlService.getDeviceById(deviceId)
    if (device) {
      const existing = this.incrementalBuffer.deviceUpdates.find(
        d => d.id === device.id
      )
      if (existing) {
        Object.assign(existing, device)
      } else {
        this.incrementalBuffer.deviceUpdates.push(device)
      }
      this.scheduleBroadcast()
    }
  }

  broadcastDeviceUpdate(device: Device) {
    const existing = this.incrementalBuffer.deviceUpdates.find(
      d => d.id === device.id
    )
    if (existing) {
      Object.assign(existing, device)
    } else {
      this.incrementalBuffer.deviceUpdates.push(device)
    }
    this.scheduleBroadcast()
  }

  getClientCount(): number {
    return this.connectedClients.size
  }

  shutdown() {
    if (this.broadcastTimer) {
      clearTimeout(this.broadcastTimer)
      this.broadcastTimer = null
    }
    if (this.alarmBroadcastTimer) {
      clearTimeout(this.alarmBroadcastTimer)
      this.alarmBroadcastTimer = null
    }
    this.flushBroadcast()
    if (this.io) {
      this.io.close()
      this.io = null
    }
  }
}

export const webSocketService = new WebSocketService()

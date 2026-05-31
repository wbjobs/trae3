import { ref } from 'vue'
import { io, Socket } from 'socket.io-client'
import { useMonitorStore } from '../stores/monitor'
import type { SensorData, Device, AlarmLog } from '../types'

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001'
const WS_PATH = import.meta.env.VITE_WS_PATH || '/ws'

let socketInstance: Socket | null = null
let isConnectedRef = ref(false)
let reconnectAttempts = 0
const maxReconnectAttempts = 10
let initialized = false

export function useWebSocket() {
  const store = useMonitorStore()

  const connect = () => {
    if (socketInstance?.connected) {
      return
    }

    if (socketInstance) {
      socketInstance.connect()
      return
    }

    console.log('正在连接 WebSocket...')

    socketInstance = io(WS_URL, {
      path: WS_PATH,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    })

    socketInstance.on('connect', () => {
      console.log('WebSocket 连接成功')
      isConnectedRef.value = true
      store.setConnected(true)
      reconnectAttempts = 0

      socketInstance?.emit('subscribe:all')
    })

    socketInstance.on('disconnect', () => {
      console.log('WebSocket 断开连接')
      isConnectedRef.value = false
      store.setConnected(false)
    })

    socketInstance.on('connect_error', (error) => {
      console.error('WebSocket 连接错误:', error)
      reconnectAttempts++
    })

    socketInstance.on('welcome', (data) => {
      console.log('服务器欢迎消息:', data.message)
    })

    socketInstance.on('data:init', (data) => {
      console.log('收到初始数据')
      store.initFromData({
        cabins: data.cabins || [],
        sensorData: parseSensorDataArray(data.sensorData || []),
        devices: data.devices || [],
        pendingAlarms: parseAlarmLogArray(data.pendingAlarms || []),
        stats: data.stats || {},
      })

      if (data.sensors && data.sensors.length > 0) {
        store.setSensors(data.sensors)
      }

      if (data.linkageRules && data.linkageRules.length > 0) {
        store.setLinkageRules(data.linkageRules)
      }

      initialized = true
    })

    socketInstance.on('data:sensor', (data: SensorData) => {
      store.updateSensorData(parseSensorData(data))
    })

    socketInstance.on('data:batch', (dataArray: SensorData[]) => {
      store.updateBatchSensorData(parseSensorDataArray(dataArray))
    })

    socketInstance.on('data:cabin:batch', (data: { cabinId: string; data: SensorData[] }) => {
      store.updateBatchSensorData(parseSensorDataArray(data.data))
    })

    socketInstance.on('device:update', (device: Device) => {
      store.updateDevice(device)
    })

    socketInstance.on('alarm:new', (alarm: AlarmLog) => {
      store.addAlarm(parseAlarmLog(alarm))
    })

    socketInstance.on('alarm:update', (alarms: AlarmLog[]) => {
      store.updateAlarms(parseAlarmLogArray(alarms))
    })

    socketInstance.on('device:control:result', (result) => {
      console.log('设备控制结果:', result)
    })
  }

  const disconnect = () => {
    // 不再由组件卸载时断开连接，保持单例持久连接
  }

  const sendDeviceControl = (deviceId: string, action: 'turnOn' | 'turnOff' | 'setValue', value?: number) => {
    if (!socketInstance?.connected) {
      console.error('WebSocket 未连接')
      return false
    }

    socketInstance.emit('device:control', {
      deviceId,
      action,
      value,
    })
    return true
  }

  const acknowledgeAlarm = (alarmId: string) => {
    if (!socketInstance?.connected) return false
    socketInstance.emit('alarm:acknowledge', alarmId)
    return true
  }

  const resolveAlarm = (alarmId: string) => {
    if (!socketInstance?.connected) return false
    socketInstance.emit('alarm:resolve', alarmId)
    return true
  }

  const requestRealtime = () => {
    if (socketInstance?.connected) {
      socketInstance.emit('request:realtime')
    }
  }

  return {
    socket: ref(socketInstance),
    isConnected: isConnectedRef,
    reconnectAttempts: ref(reconnectAttempts),
    connect,
    disconnect,
    sendDeviceControl,
    acknowledgeAlarm,
    resolveAlarm,
    requestRealtime,
  }
}

function parseSensorData(data: any): SensorData {
  return {
    ...data,
    timestamp: new Date(data.timestamp),
  }
}

function parseSensorDataArray(dataArray: any[]): SensorData[] {
  return dataArray.map(parseSensorData)
}

function parseAlarmLog(data: any): AlarmLog {
  return {
    ...data,
    timestamp: new Date(data.timestamp),
    resolvedAt: data.resolvedAt ? new Date(data.resolvedAt) : undefined,
  }
}

function parseAlarmLogArray(dataArray: any[]): AlarmLog[] {
  return dataArray.map(parseAlarmLog)
}

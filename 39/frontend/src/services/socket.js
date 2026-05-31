import { io } from 'socket.io-client'
import useStore from '../store/useStore'

class SocketService {
  constructor() {
    this.socket = null
    this.reconnectAttempts = 0
    this.maxReconnectAttempts = 10
  }

  connect(userId, userName, userRole = 'operator') {
    return new Promise((resolve, reject) => {
      try {
        this.socket = io('http://localhost:3001', {
          transports: ['websocket', 'polling'],
          reconnection: true,
          reconnectionDelay: 1000,
          reconnectionDelayMax: 5000,
          query: { userId, userName, userRole }
        })

        this.socket.on('connect', () => {
          console.log('Socket connected:', this.socket.id)
          useStore.getState().setConnected(true)
          this.reconnectAttempts = 0
          resolve(this.socket)
        })

        this.socket.on('disconnect', () => {
          console.log('Socket disconnected')
          useStore.getState().setConnected(false)
        })

        this.socket.on('connect_error', (error) => {
          console.error('Socket connection error:', error)
          this.reconnectAttempts++
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            reject(new Error('Max reconnection attempts reached'))
          }
        })

        this.socket.on('device:update', (device) => {
          if (device.id) {
            useStore.getState().updateDevice(device.id, device)
          } else {
            useStore.getState().updateDevice(device.id || device.deviceId, device)
          }
          useStore.getState().updateDeviceStats()
        })

        this.socket.on('devices:batch', ({ updates }) => {
          const state = useStore.getState()
          updates.forEach(update => {
            if (update.type === 'full') {
              state.updateDevice(update.id, update.data)
            } else {
              const currentDevice = state.devices[update.id]
              if (currentDevice) {
                const updatedDevice = {
                  ...currentDevice,
                  params: { ...currentDevice.params, ...update.changes }
                }
                if (update.changes.status) {
                  updatedDevice.status = update.changes.status
                }
                state.updateDevice(update.id, updatedDevice)
              }
            }
          })
          state.updateDeviceStats()
        })

        this.socket.on('devices:initial', (devices) => {
          const deviceMap = {}
          devices.forEach(d => {
            deviceMap[d.id] = d
          })
          useStore.getState().setDevices(deviceMap)
          useStore.getState().updateDeviceStats()
        })

        this.socket.on('command:queued', (response) => {
          console.log('📋 指令已入队:', response)
        })

        this.socket.on('alarm:new', (alarm) => {
          useStore.getState().addAlarm(alarm)
        })

        this.socket.on('users:update', (users) => {
          useStore.getState().setOnlineUsers(users)
        })

        this.socket.on('user:current', (user) => {
          useStore.getState().setCurrentUser(user)
        })

        this.socket.on('command:response', (response) => {
          console.log('Command response:', response)
        })

        this.socket.on('alarm:acknowledged', ({ alarmId }) => {
          useStore.getState().clearAlarm(alarmId)
        })

        this.socket.on('alarms:cleared', () => {
          useStore.getState().clearAllAlarms()
        })

      } catch (error) {
        reject(error)
      }
    })
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  sendCommand(deviceId, command, params = {}) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('command:send', {
        deviceId,
        command,
        params,
        timestamp: Date.now()
      })
    }
  }

  selectDevice(deviceId) {
    if (this.socket && this.socket.connected) {
      this.socket.emit('user:selectDevice', { deviceId })
    }
  }

  emit(event, data) {
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data)
    }
  }

  on(event, callback) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  off(event, callback) {
    if (this.socket) {
      this.socket.off(event, callback)
    }
  }
}

export default new SocketService()

import { EventEmitter } from 'events'
import cron from 'node-cron'

class DataCollector extends EventEmitter {
  constructor(db) {
    super()
    this.db = db
    this.collectors = new Map()
    this.isRunning = false
  }

  start() {
    if (this.isRunning) return
    
    this.isRunning = true
    console.log('📡 数据采集模块启动中...')
    
    const devices = this.db.getAllDevices()
    
    devices.forEach(device => {
      this._startDeviceCollector(device)
    })
    
    this._startAlarmSimulator()
    
    console.log(`✅ 已启动 ${devices.length} 个设备数据采集器`)
  }

  stop() {
    this.isRunning = false
    this.collectors.forEach(interval => clearInterval(interval))
    this.collectors.clear()
    console.log('📡 数据采集模块已停止')
  }

  _startDeviceCollector(device) {
    const interval = setInterval(() => {
      if (!this.isRunning) return
      
      const updates = this._generateDeviceData(device)
      const updatedDevice = this.db.updateDevice(device.id, updates)
      
      if (updatedDevice) {
        this.emit('deviceUpdate', updatedDevice)
      }
    }, 1000 + Math.random() * 500)
    
    this.collectors.set(device.id, interval)
  }

  _generateDeviceData(device) {
    const updates = {}
    
    if (device.status === 'running') {
      updates.temperature = this._randomWalk(device.temperature, 2, 20, 85)
      updates.runtime = device.runtime + 0.001
      
      if (Math.random() > 0.7) {
        updates.output = device.output + Math.floor(Math.random() * 5)
      }
      
      updates.energy = this._randomWalk(device.energy, 0.1, 0, 500)
      updates.speed = this._randomWalk(device.speed, 2, 1, 100)
    } else if (device.status === 'idle') {
      updates.temperature = this._randomWalk(device.temperature, 0.5, 20, 30)
    } else if (device.status === 'fault') {
      updates.temperature = this._randomWalk(device.temperature, 3, 50, 100)
    }
    
    return updates
  }

  _randomWalk(current, stepSize, min, max) {
    const change = (Math.random() - 0.5) * 2 * stepSize
    return Math.max(min, Math.min(max, current + change)).toFixed(1) * 1
  }

  _startAlarmSimulator() {
    cron.schedule('*/30 * * * * *', () => {
      if (!this.isRunning) return
      
      if (Math.random() > 0.7) {
        const alarmCount = this.db.getAlarms().length
        if (alarmCount < 50) {
          this._generateRandomAlarm()
        } else {
          console.log(`⚠️  告警数量过多 (${alarmCount})，暂停生成新告警`)
        }
      }
    })

    cron.schedule('0 */5 * * * *', () => {
      if (!this.isRunning) return
      
      const alarms = this.db.getAlarms()
      const now = Date.now()
      const expiredAlarms = alarms.filter(a => now - a.timestamp > 30 * 60 * 1000)
      
      expiredAlarms.forEach(alarm => {
        this.db.removeAlarm(alarm.id)
      })
      
      if (expiredAlarms.length > 0) {
        console.log(`🗑️  自动清理了 ${expiredAlarms.length} 条过期告警`)
      }
    })
  }

  _generateRandomAlarm() {
    const devices = this.db.getAllDevices()
    const runningDevices = devices.filter(d => d.status === 'running')
    
    if (runningDevices.length === 0) return
    
    const device = runningDevices[Math.floor(Math.random() * runningDevices.length)]
    
    const alarmTypes = [
      { type: 'info', message: '设备运行参数波动', threshold: 0.5 },
      { type: 'warning', message: '温度接近上限阈值', threshold: 0.3 },
      { type: 'critical', message: '设备异常振动', threshold: 0.1 },
      { type: 'warning', message: '维护周期即将到期', threshold: 0.1 }
    ]
    
    const rand = Math.random()
    let cumulative = 0
    let selectedAlarm = alarmTypes[0]
    
    for (const alarm of alarmTypes) {
      cumulative += alarm.threshold
      if (rand < cumulative) {
        selectedAlarm = alarm
        break
      }
    }
    
    const alarm = this.db.addAlarm({
      deviceId: device.id,
      deviceName: device.name,
      type: selectedAlarm.type,
      message: selectedAlarm.message,
      level: selectedAlarm.type === 'critical' ? 3 : 
             selectedAlarm.type === 'warning' ? 2 : 1
    })
    
    this.emit('alarm', alarm)
    console.log(`⚠️  告警触发: ${device.name} - ${selectedAlarm.message}`)
  }

  addDevice(device) {
    if (!this.collectors.has(device.id)) {
      this._startDeviceCollector(device)
    }
  }

  removeDevice(deviceId) {
    const interval = this.collectors.get(deviceId)
    if (interval) {
      clearInterval(interval)
      this.collectors.delete(deviceId)
    }
  }
}

export default DataCollector

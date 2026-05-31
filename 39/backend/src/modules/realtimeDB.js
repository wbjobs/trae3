import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const defaultDevices = [
  {
    id: 'conveyor-1',
    name: '主传送带',
    type: 'conveyor',
    status: 'running',
    speed: 75,
    mode: 'auto',
    temperature: 42,
    runtime: 1256,
    output: 8920,
    energy: 45.6,
    lastUpdate: Date.now()
  },
  {
    id: 'conveyor-2',
    name: '分拣传送带',
    type: 'conveyor',
    status: 'running',
    speed: 60,
    mode: 'auto',
    temperature: 38,
    runtime: 980,
    output: 7650,
    energy: 32.3,
    lastUpdate: Date.now()
  },
  {
    id: 'robot-1',
    name: '机械臂A',
    type: 'robot',
    status: 'running',
    speed: 85,
    mode: 'auto',
    temperature: 55,
    runtime: 2100,
    output: 15600,
    energy: 128.5,
    lastUpdate: Date.now()
  },
  {
    id: 'cnc-1',
    name: 'CNC机床1',
    type: 'cnc',
    status: 'running',
    speed: 100,
    mode: 'auto',
    temperature: 68,
    runtime: 3400,
    output: 4520,
    energy: 256.8,
    lastUpdate: Date.now()
  },
  {
    id: 'cnc-2',
    name: 'CNC机床2',
    type: 'cnc',
    status: 'idle',
    speed: 0,
    mode: 'manual',
    temperature: 25,
    runtime: 1800,
    output: 2180,
    energy: 89.2,
    lastUpdate: Date.now()
  },
  {
    id: 'shelf-1',
    name: '货架A',
    type: 'shelf',
    status: 'idle',
    speed: 0,
    mode: 'auto',
    temperature: 22,
    runtime: 0,
    output: 0,
    energy: 2.1,
    lastUpdate: Date.now()
  },
  {
    id: 'shelf-2',
    name: '货架B',
    type: 'shelf',
    status: 'idle',
    speed: 0,
    mode: 'auto',
    temperature: 23,
    runtime: 0,
    output: 0,
    energy: 1.8,
    lastUpdate: Date.now()
  },
  {
    id: 'agv-1',
    name: 'AGV小车',
    type: 'agv',
    status: 'running',
    speed: 45,
    mode: 'auto',
    temperature: 35,
    runtime: 560,
    output: 1250,
    energy: 15.6,
    lastUpdate: Date.now()
  }
]

class RealtimeDB {
  constructor() {
    this.db = null
    this.inMemoryData = {
      devices: {},
      alarms: []
    }
    
    defaultDevices.forEach(device => {
      this.inMemoryData.devices[device.id] = device
    })
  }

  async init() {
    const dbPath = path.join(__dirname, '../../data/db.json')
    const adapter = new JSONFile(dbPath)
    this.db = new Low(adapter, { devices: [], alarms: [] })
    
    await this.db.read()
    
    if (this.db.data.devices.length === 0) {
      this.db.data.devices = defaultDevices
      await this.db.write()
    }
    
    this.db.data.devices.forEach(device => {
      this.inMemoryData.devices[device.id] = device
    })
    
    this.inMemoryData.alarms = this.db.data.alarms || []
  }

  getDevice(deviceId) {
    return this.inMemoryData.devices[deviceId]
  }

  getAllDevices() {
    return Object.values(this.inMemoryData.devices)
  }

  updateDevice(deviceId, updates) {
    if (this.inMemoryData.devices[deviceId]) {
      this.inMemoryData.devices[deviceId] = {
        ...this.inMemoryData.devices[deviceId],
        ...updates,
        lastUpdate: Date.now()
      }
      
      this._persist()
      return this.inMemoryData.devices[deviceId]
    }
    return null
  }

  setDeviceStatus(deviceId, status) {
    return this.updateDevice(deviceId, { status })
  }

  addAlarm(alarm) {
    const newAlarm = {
      id: `alarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      ...alarm,
      timestamp: Date.now()
    }
    
    this.inMemoryData.alarms.unshift(newAlarm)
    
    if (this.inMemoryData.alarms.length > 100) {
      this.inMemoryData.alarms = this.inMemoryData.alarms.slice(0, 100)
    }
    
    this._persist()
    return newAlarm
  }

  getAlarms() {
    return this.inMemoryData.alarms
  }

  removeAlarm(alarmId) {
    const beforeLength = this.inMemoryData.alarms.length
    this.inMemoryData.alarms = this.inMemoryData.alarms.filter(
      a => a.id !== alarmId
    )
    const removed = beforeLength !== this.inMemoryData.alarms.length
    this._persist()
    return removed
  }

  clearAllAlarms() {
    this.inMemoryData.alarms = []
    this._persist()
  }

  _persist() {
    if (this.db) {
      this.db.data.devices = Object.values(this.inMemoryData.devices)
      this.db.data.alarms = this.inMemoryData.alarms
      this.db.write().catch(console.error)
    }
  }
}

export default RealtimeDB

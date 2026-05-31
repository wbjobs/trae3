import { writeSensorData, writeSensorDataBatch, querySensorHistory } from '../database/influxdb'
import getSQLiteDB from '../database/sqlite'

type SensorType = 'temperature' | 'humidity' | 'level' | 'pressure'

interface Sensor {
  id: string
  cabinId: string
  type: SensorType
  name: string
  unit: string
  minValue: number
  maxValue: number
  warnThreshold: number
  alarmThreshold: number
}

interface SensorData {
  cabinId: string
  sensorId: string
  sensorType: SensorType
  value: number
  unit: string
  timestamp: Date
}

interface Cabin {
  id: string
  name: string
  description: string
  position: string
  status: boolean
}

export class SensorDataService {
  private latestData: Map<string, SensorData> = new Map()
  private dataPointCount: number = 0
  private writeBuffer: SensorData[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private readonly FLUSH_INTERVAL_MS = 5000
  private readonly MAX_BUFFER_SIZE = 200
  private sensorCache: Sensor[] | null = null
  private cabinCache: Cabin[] | null = null

  constructor() {
    this.startFlushTimer()
  }

  private startFlushTimer() {
    if (this.flushTimer) return
    this.flushTimer = setInterval(() => {
      this.flushWriteBuffer()
    }, this.FLUSH_INTERVAL_MS)
  }

  private async flushWriteBuffer() {
    if (this.writeBuffer.length === 0) return

    const batch = this.writeBuffer.splice(0, this.writeBuffer.length)
    try {
      await writeSensorDataBatch(batch)
    } catch (error) {
      console.error('批量写入InfluxDB失败:', error)
    }
  }

  async receiveData(data: SensorData): Promise<boolean> {
    try {
      this.latestData.set(data.sensorId, data)
      this.dataPointCount++

      this.writeBuffer.push(data)

      if (this.writeBuffer.length >= this.MAX_BUFFER_SIZE) {
        this.flushWriteBuffer()
      }

      return true
    } catch (error) {
      console.error('接收传感器数据失败:', error)
      return false
    }
  }

  async receiveBatchData(dataArray: SensorData[]): Promise<{ success: boolean; received: number }> {
    let received = 0

    for (const data of dataArray) {
      this.latestData.set(data.sensorId, data)
      this.dataPointCount++
      this.writeBuffer.push(data)
      received++
    }

    if (this.writeBuffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushWriteBuffer()
    }

    return { success: received > 0, received }
  }

  getLatestData(sensorId: string): SensorData | null {
    return this.latestData.get(sensorId) || null
  }

  getCabinLatestData(cabinId: string): SensorData[] {
    const result: SensorData[] = []
    for (const data of this.latestData.values()) {
      if (data.cabinId === cabinId) {
        result.push(data)
      }
    }
    return result
  }

  getAllLatestData(): SensorData[] {
    return Array.from(this.latestData.values())
  }

  async getHistoryData(
    sensorId: string,
    startTime: Date,
    endTime: Date,
    interval: string = '1m'
  ): Promise<Array<{ time: Date; value: number }>> {
    return querySensorHistory(sensorId, startTime, endTime, interval)
  }

  getSensors(): Sensor[] {
    if (this.sensorCache) return this.sensorCache
    const db = getSQLiteDB()
    const rows = db.prepare(`
      SELECT id, cabin_id as cabinId, type, name, unit, 
             min_value as minValue, max_value as maxValue,
             warn_threshold as warnThreshold, alarm_threshold as alarmThreshold
      FROM sensors
    `).all() as any[]

    this.sensorCache = rows.map(row => ({
      id: row.id,
      cabinId: row.cabinId,
      type: row.type,
      name: row.name,
      unit: row.unit,
      minValue: row.minValue,
      maxValue: row.maxValue,
      warnThreshold: row.warnThreshold,
      alarmThreshold: row.alarmThreshold,
    }))
    return this.sensorCache
  }

  invalidateSensorCache() {
    this.sensorCache = null
  }

  getSensorById(sensorId: string): Sensor | null {
    const sensors = this.getSensors()
    return sensors.find(s => s.id === sensorId) || null
  }

  getCabins(): Cabin[] {
    if (this.cabinCache) return this.cabinCache
    const db = getSQLiteDB()
    const rows = db.prepare('SELECT id, name, description, position, status FROM cabins').all() as any[]

    this.cabinCache = rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      position: row.position,
      status: row.status === 1,
    }))
    return this.cabinCache
  }

  invalidateCabinCache() {
    this.cabinCache = null
  }

  getCabinById(cabinId: string): Cabin | null {
    const cabins = this.getCabins()
    return cabins.find(c => c.id === cabinId) || null
  }

  getSensorsByCabin(cabinId: string): Sensor[] {
    return this.getSensors().filter(s => s.cabinId === cabinId)
  }

  getDataPointCount(): number {
    return this.dataPointCount
  }

  resetDataPointCount(): void {
    this.dataPointCount = 0
  }

  destroy() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
    this.flushWriteBuffer()
  }
}

export const sensorDataService = new SensorDataService()

import { sensorDataService } from './SensorDataService'
import { alarmService } from './AlarmService'
import { deviceControlService } from './DeviceControlService'
import { webSocketService } from './WebSocketService'
import config from '../../config'

type SensorType = 'temperature' | 'humidity' | 'level' | 'pressure'

interface SensorData {
  cabinId: string
  sensorId: string
  sensorType: SensorType
  value: number
  unit: string
  timestamp: Date
}

export class DataSimulator {
  private intervalId: any = null
  private sensorConfigs: Array<{
    sensorId: string
    cabinId: string
    type: SensorType
    name: string
    unit: string
    baseValue: number
    variance: number
    warnThreshold: number
    alarmThreshold: number
  }> = []

  private currentValues: Map<string, number> = new Map()

  init() {
    const sensors = sensorDataService.getSensors()
    this.sensorConfigs = sensors.map(sensor => ({
      sensorId: sensor.id,
      cabinId: sensor.cabinId,
      type: sensor.type,
      name: sensor.name,
      unit: sensor.unit,
      baseValue: (sensor.minValue + sensor.maxValue) / 2,
      variance: (sensor.maxValue - sensor.minValue) * 0.15,
      warnThreshold: sensor.warnThreshold,
      alarmThreshold: sensor.alarmThreshold,
    }))

    this.sensorConfigs.forEach(config => {
      this.currentValues.set(config.sensorId, config.baseValue)
    })
  }

  start() {
    if (!config.dataSimulator.enabled) {
      console.log('数据模拟器已禁用')
      return
    }

    if (this.intervalId) return

    this.init()
    console.log(`数据模拟器已启动，间隔: ${config.dataSimulator.interval}ms`)

    this.intervalId = setInterval(() => {
      this.generateData()
    }, config.dataSimulator.interval)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
      console.log('数据模拟器已停止')
    }
  }

  private generateData() {
    const dataBatch: SensorData[] = []

    this.sensorConfigs.forEach(config => {
      const currentValue = this.currentValues.get(config.sensorId) ?? config.baseValue
      
      let newValue = currentValue + (Math.random() - 0.5) * config.variance
      
      if (Math.random() < 0.02) {
        newValue += (Math.random() - 0.5) * config.variance * 3
      }

      newValue = Math.max(
        config.baseValue - config.variance * 2,
        Math.min(config.baseValue + config.variance * 2, newValue)
      )

      this.currentValues.set(config.sensorId, newValue)

      const sensorData: SensorData = {
        cabinId: config.cabinId,
        sensorId: config.sensorId,
        sensorType: config.type,
        value: Math.round(newValue * 100) / 100,
        unit: config.unit,
        timestamp: new Date(),
      }

      dataBatch.push(sensorData)

      alarmService.checkSensorData(sensorData, {
        id: config.sensorId,
        warnThreshold: config.warnThreshold,
        alarmThreshold: config.alarmThreshold,
      })

      deviceControlService.checkLinkageRules(config.sensorId, newValue)
    })

    sensorDataService.receiveBatchData(dataBatch)
    webSocketService.queueBatchSensorData(dataBatch)
  }

  setSensorValue(sensorId: string, value: number) {
    const config = this.sensorConfigs.find(c => c.sensorId === sensorId)
    if (!config) return

    this.currentValues.set(sensorId, value)
  }

  injectAnomaly(sensorId?: string) {
    const targets = sensorId 
      ? this.sensorConfigs.filter(c => c.sensorId === sensorId)
      : this.sensorConfigs

    targets.forEach(config => {
      const anomalyValue = config.baseValue + config.variance * 4
      this.currentValues.set(config.sensorId, anomalyValue)
    })
  }
}

export const dataSimulator = new DataSimulator()

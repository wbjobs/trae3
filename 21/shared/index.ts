
export type SensorType = 'temperature' | 'humidity' | 'level' | 'pressure'

export type AlarmLevel = 'info' | 'warning' | 'critical'

export type AlarmStatus = 'pending' | 'acknowledged' | 'resolved'

export type DeviceType = 'fan' | 'pump' | 'valve' | 'heater' | 'cooler'

export type DeviceStatus = 'on' | 'off' | 'error'

export type DeployEnvironment = 'nearshore' | 'offshore'

export interface Cabin {
  id: string
  name: string
  description: string
  position: string
  status: boolean
}

export interface Sensor {
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

export interface SensorData {
  cabinId: string
  sensorId: string
  sensorType: SensorType
  value: number
  unit: string
  timestamp: Date
}

export interface Device {
  id: string
  cabinId: string
  type: DeviceType
  name: string
  status: DeviceStatus
  currentValue: number
  targetValue?: number
}

export interface DeviceControlCommand {
  deviceId: string
  action: 'turnOn' | 'turnOff' | 'setValue'
  value?: number
  operatorId: string
}

export interface AlarmRule {
  id: string
  sensorId: string
  condition: 'above' | 'below' | 'equals'
  threshold: number
  level: AlarmLevel
  enabled: boolean
}

export interface AlarmLog {
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

export interface ControlLog {
  id: string
  deviceId: string
  action: string
  value?: number
  operatorId: string
  timestamp: Date
  success: boolean
  message?: string
}

export interface LinkageRule {
  id: string
  name: string
  description: string
  condition: {
    sensorId: string
    operator: '>' | '<' | '>=' | '<=' | '=='
    value: number
  }
  action: {
    deviceId: string
    command: 'turnOn' | 'turnOff' | 'setValue'
    value?: number
  }
  enabled: boolean
}

export interface SystemStats {
  totalSensors: number
  activeSensors: number
  totalDevices: number
  activeDevices: number
  activeAlarms: number
  todayAlarms: number
  dataPointsToday: number
}

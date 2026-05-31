export interface Device {
  id: string
  name: string
  model: string
  status: "online" | "offline" | "fault" | "warning"
  lastSeen: number
  params: DeviceParams
  groupIds?: string[]
}

export interface DeviceParams {
  acVoltage: number
  acCurrent: number
  acFrequency: number
  acPower: number
  dcVoltage: number
  dcCurrent: number
  dcPower: number
  dailyEnergy: number
  totalEnergy: number
  temperature: number
  efficiency: number
}

export interface ConfigParams {
  [key: string]: number
  ratedPower: number
  acVoltageMax: number
  acVoltageMin: number
  overVoltageThreshold: number
  underVoltageThreshold: number
  overFreqThreshold: number
  underFreqThreshold: number
  overTempThreshold: number
  heartbeatInterval: number
  reportInterval: number
}

export interface ConfigChange {
  field: string
  oldValue: number
  newValue: number
}

export interface ConfigTemplate {
  id: string
  name: string
  description: string
  params: ConfigParams
  createdAt: number
}

export interface ConfigHistory {
  id: number
  deviceId: string
  params: ConfigParams
  previousParams?: ConfigParams
  changes?: ConfigChange[]
  appliedBy: string
  status: "success" | "failed" | "pending"
  appliedAt: number
}

export interface Alert {
  id: string
  deviceId: string
  deviceName: string
  level: "critical" | "warning" | "info"
  type: string
  message: string
  timestamp: number
  acknowledged: boolean
}

export interface AlertRule {
  id: string
  name: string
  paramName: string
  operator: string
  threshold: number
  level: "critical" | "warning" | "info"
  enabled: boolean
}

export interface HistoryRecord {
  timestamp: number
  params: Partial<DeviceParams>
}

export interface DeviceStats {
  totalPower: number
  dailyEnergy: number
  onlineRate: number
  deviceCount: number
  onlineCount: number
}

export interface DeviceGroup {
  id: string
  name: string
  description: string
  color: string
  deviceCount: number
  deviceIds: string[]
  createdAt: number
}

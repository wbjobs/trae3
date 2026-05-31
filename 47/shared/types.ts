export interface PvDataPoint {
  timestamp: number
  arrayId: string
  power: number
  voltage: number
  current: number
  temperature: number
  irradiance: number
  efficiency: number
}

export interface AnomalyEvent {
  id: string
  timestamp: number
  arrayId: string
  level: 'warning' | 'critical' | 'fault'
  type: string
  description: string
  metrics: Record<string, number>
  suggestion: string
}

export interface KpiData {
  totalPower: number
  dailyEnergy: number
  onlineInverters: number
  currentIrradiance: number
}

export interface DeviceStatus {
  deviceId: string
  deviceType: 'inverter' | 'string'
  status: 'online' | 'offline' | 'fault'
  lastUpdate: number
  arrayId: string
}

export interface ArrayConfig {
  arrayId: string
  name: string
  rowPos: number
  colPos: number
  ratedPower: number
  inverterCount: number
}

export type WSMessageType = 'realtime_data' | 'anomaly_event' | 'metric_update' | 'device_status' | 'forecast_update' | 'window_metrics'

export interface WSMessage {
  type: WSMessageType
  timestamp: number
  payload: PvDataPoint | AnomalyEvent | KpiData | DeviceStatus | ForecastData | { arrayId: string; metrics: SlidingWindowMetrics }
}

export interface HistoryQuery {
  start: string
  end: string
  metrics: string[]
  arrayIds?: string[]
  interval?: '1m' | '5m' | '15m' | '1h'
}

export interface HistoryResponse {
  timestamps: string[]
  series: { metric: string; arrayId: string; values: number[] }[]
}

export interface AnomalyQuery {
  start: string
  end: string
  level?: string
  type?: string
  page?: number
  pageSize?: number
}

export interface AnomalyListResponse {
  total: number
  events: AnomalyEvent[]
}

export interface HeatmapResponse {
  arrays: { arrayId: string; row: number; col: number; anomalyCount: number }[]
}

export interface ForecastPoint {
  timestamp: number
  power: number
  irradiance: number
  temperature: number
}

export interface ForecastData {
  arrayId: string
  forecast: ForecastPoint[]
  confidence: number
}

export interface SlidingWindowMetrics {
  windowStart: number
  windowEnd: number
  points: number
  avgPower: number
  maxPower: number
  minPower: number
  avgEfficiency: number
  powerTrend: number
}

export interface DrillDownData {
  arrayId: string
  timestamp: number
  metrics: PvDataPoint
  windowMetrics: SlidingWindowMetrics
}

export const ARRAY_IDS = [
  'PV-A01', 'PV-A02', 'PV-A03', 'PV-A04',
  'PV-B01', 'PV-B02', 'PV-B03', 'PV-B04',
  'PV-C01', 'PV-C02', 'PV-C03', 'PV-C04',
]

export const ARRAY_CONFIGS: ArrayConfig[] = ARRAY_IDS.map((id, i) => ({
  arrayId: id,
  name: `${id} 号阵列`,
  rowPos: Math.floor(i / 4),
  colPos: i % 4,
  ratedPower: 500,
  inverterCount: 2,
}))

export const METRIC_LABELS: Record<string, string> = {
  power: '有功功率 (kW)',
  voltage: '直流电压 (V)',
  current: '直流电流 (A)',
  temperature: '组件温度 (°C)',
  irradiance: '辐照度 (W/m²)',
  efficiency: '转换效率 (%)',
}

export const ANOMALY_TYPES = [
  { type: 'low_efficiency', label: '效率偏低', description: '阵列转换效率低于阈值', suggestion: '检查组件清洁度，排除遮挡' },
  { type: 'power_drop', label: '功率骤降', description: '输出功率突然下降超过阈值', suggestion: '检查逆变器状态和组串连接' },
  { type: 'over_temperature', label: '温度过高', description: '组件温度超过安全阈值', suggestion: '检查散热系统，降低负荷' },
  { type: 'voltage_anomaly', label: '电压异常', description: '直流侧电压偏离正常范围', suggestion: '检查组串接线和MPPT跟踪' },
  { type: 'irradiance_mismatch', label: '辐照度不匹配', description: '功率与辐照度比例异常', suggestion: '检查组件衰减和阴影遮挡' },
]

export const HOT_WINDOW_MS = 2 * 60 * 60 * 1000
export const FORECAST_WINDOW_SIZE = 12
export const SLIDING_WINDOW_SIZE = 10

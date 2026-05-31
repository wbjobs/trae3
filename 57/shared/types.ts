export type AlertLevel = 'blue' | 'yellow' | 'orange' | 'red'
export type StationStatus = 'online' | 'offline' | 'warning'
export type AlertStatus = 'active' | 'confirmed' | 'ignored'
export type AggregationType = 'raw' | 'hourly' | 'daily' | 'monthly'
export type IndicatorType = 'riseRate' | 'peakFlow' | 'runoffCoeff' | 'rainfallIntensity' | 'returnPeriod' | 'extremeLevel' | 'extremeFlow'

export interface Station {
  id: string
  name: string
  lat: number
  lng: number
  river: string
  status: StationStatus
  dataFormat: string
  createdAt: string
  lastReportTime?: string
  metrics?: string[]
  latestValues?: Record<string, number>
}

export interface MonitorData {
  id: string
  stationId: string
  timestamp: string
  waterLevel: number | null
  flowRate: number | null
  rainfall: number | null
  waterTemp: number | null
  ph: number | null
  dissolvedOxygen: number | null
}

export interface AlertRule {
  id: string
  stationId: string
  metric: string
  level: AlertLevel
  threshold: number
  operator: string
  enabled: boolean
}

export interface Alert {
  id: string
  stationId: string
  stationName: string
  ruleId: string
  level: AlertLevel
  metric: string
  value: number
  threshold: number
  message: string
  status: AlertStatus
  timestamp: string
  comment?: string
}

export interface IndicatorResult {
  id: string
  stationId: string
  indicatorType: IndicatorType
  value: number
  unit: string
  description: string
  startTime: string
  endTime: string
  calculatedAt: string
  details: Record<string, number>
}

export interface DashboardSummary {
  totalStations: number
  onlineStations: number
  activeAlerts: number
  avgWaterLevel: number
}

export interface DashboardOverview {
  summary: DashboardSummary
  latestAlerts: Alert[]
  stationStatuses: Station[]
}

export interface DataReportRequest {
  stationId: string
  timestamp: string
  metrics: {
    waterLevel?: number
    flowRate?: number
    rainfall?: number
    waterTemp?: number
    ph?: number
    dissolvedOxygen?: number
  }
}

export interface DataQueryResponse {
  data: Array<{
    stationId: string
    timestamp: string
    values: Record<string, number | null>
  }>
  total: number
}

export const METRIC_LABELS: Record<string, string> = {
  waterLevel: '水位',
  flowRate: '流量',
  rainfall: '降雨量',
  waterTemp: '水温',
  ph: 'pH值',
  dissolvedOxygen: '溶解氧',
}

export const METRIC_UNITS: Record<string, string> = {
  waterLevel: 'm',
  flowRate: 'm³/s',
  rainfall: 'mm',
  waterTemp: '°C',
  ph: '',
  dissolvedOxygen: 'mg/L',
}

export const ALERT_LEVEL_CONFIG: Record<AlertLevel, { label: string; color: string; bgClass: string; textClass: string }> = {
  blue: { label: '蓝色预警', color: '#3B82F6', bgClass: 'bg-blue-500/20', textClass: 'text-blue-400' },
  yellow: { label: '黄色预警', color: '#F59E0B', bgClass: 'bg-yellow-500/20', textClass: 'text-yellow-400' },
  orange: { label: '橙色预警', color: '#F97316', bgClass: 'bg-orange-500/20', textClass: 'text-orange-400' },
  red: { label: '红色预警', color: '#EF4444', bgClass: 'bg-red-500/20', textClass: 'text-red-400' },
}

export const INDICATOR_LABELS: Record<IndicatorType, { label: string; unit: string; description: string }> = {
  riseRate: { label: '水位涨率', unit: 'm/h', description: '单位时间内水位上涨速率' },
  peakFlow: { label: '洪峰流量', unit: 'm³/s', description: '洪水过程中最大流量' },
  runoffCoeff: { label: '径流系数', unit: '', description: '径流量与降雨量之比' },
  rainfallIntensity: { label: '降雨强度', unit: 'mm/h', description: '单位时间降雨量' },
  returnPeriod: { label: '重现期', unit: '年', description: '该量级洪水平均出现间隔' },
  extremeLevel: { label: '极值水位', unit: 'm', description: '水位极值统计与预警' },
  extremeFlow: { label: '极值流量', unit: 'm³/s', description: '流量极值统计与预警' },
}

export interface ExtremeStatistics {
  stationId: string
  metric: string
  percentiles: {
    p50: number
    p75: number
    p90: number
    p95: number
    p99: number
  }
  max: number
  min: number
  mean: number
  stdDev: number
  currentValue: number | null
  exceedanceProbability: number | null
}

export type ExtremeWarningLevel = 'watch' | 'warning' | 'critical'

export interface ExtremeWarning {
  stationId: string
  stationName: string
  metric: string
  currentValue: number
  p95: number
  p99: number
  maxHistorical: number
  warningLevel: ExtremeWarningLevel
  message: string
}

export interface HistoricalExtremes {
  stationId: string
  metric: string
  allTimeMax: number
  allTimeMin: number
  recentMax: number
  recentMin: number
  dateOfMax: string
  dateOfMin: string
}

export interface UpstreamDownstreamPair {
  upstream: string
  downstream: string
  lagHours: number
  maxCorrelation: number
  waterLevelLag: number
  flowRateLag: number
}

export interface UpstreamDownstreamResult {
  river: string
  stations: Array<{
    id: string
    name: string
    lat: number
    lng: number
    hourlyData: Array<{ timestamp: string; waterLevel: number | null; flowRate: number | null }>
  }>
  pairs: UpstreamDownstreamPair[]
}

export interface RainfallRunoffResult {
  stationId: string
  responseTimeHours: number
  maxCorrelation: number
  totalRainfall: number
  totalRunoff: number
  runoffRatio: number
  rainfallSeries: Array<{ timestamp: string; value: number | null }>
  flowSeries: Array<{ timestamp: string; value: number | null }>
}

export interface CrossStationCorrelation {
  metric: string
  correlations: Array<{
    stationA: string
    stationB: string
    stationAName: string
    stationBName: string
    coefficient: number
    pValue: number
  }>
  matrix: number[][]
}

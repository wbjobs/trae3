export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  isInterpolated?: boolean;
}

export interface ComponentData {
  componentId: string;
  arrayId: string;
  groupId?: string;
  voltage: TimeSeriesPoint[];
  current: TimeSeriesPoint[];
  temperature: TimeSeriesPoint[];
}

export interface KeyMetrics {
  totalPower?: number;
  totalGeneration?: number;
  currentPower: number;
  efficiency: number;
  onlineRate: number;
  faultCount: number;
  avgTemperature?: number;
  temperatureAvg?: number;
  lastUpdate?: number;
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

export type FaultType = 'voltage_abnormal' | 'current_abnormal' | 'temperature_high' | 'offline' | 'short_circuit';
export type FaultSeverity = 'low' | 'medium' | 'high' | 'critical';
export type FaultStatus = 'active' | 'resolved' | 'ignored';

export interface FaultRecord {
  id: string;
  componentId: string;
  faultType: FaultType;
  severity: FaultSeverity;
  startTime: number;
  endTime?: number;
  status: FaultStatus;
  description: string;
  location?: { row: number; col: number };
  thresholdValue?: number;
  actualValue?: number;
}

export interface ArrayGroup {
  id: string;
  name: string;
  description?: string;
  componentIds: string[];
  arrayIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
export type ReportFormat = 'pdf' | 'excel';
export type ReportStatus = 'generating' | 'completed' | 'failed';

export interface OperationReport {
  id: string;
  name: string;
  type: ReportType;
  format: ReportFormat;
  startTime: number;
  endTime: number;
  status: ReportStatus;
  downloadUrl?: string;
  createdAt: number;
}

export interface FaultStatisticsItem {
  name: string;
  value: number;
  percentage?: number;
  color?: string;
}

export interface FaultStatistics {
  total: number;
  active: number;
  resolved: number;
  ignored: number;
  resolutionRate?: number;
  activeRate?: number;
  mttr_hours?: number;
  mtbf_hours?: number;
  weighted_severity_score?: number;
  byType: FaultStatisticsItem[];
  bySeverity: FaultStatisticsItem[];
  byComponent: FaultStatisticsItem[];
  byStatus?: FaultStatisticsItem[];
  trend?: { date: string; value: number; timestamp?: number }[];
  by_time?: { time: string; count: number }[];
}

export interface ChartTheme {
  colors: string[];
  backgroundColor: string;
  textColor: string;
  axisColor: string;
}

export interface WarningThreshold {
  metric: string;
  warningLow?: number;
  warningHigh?: number;
  criticalLow?: number;
  criticalHigh?: number;
}

export interface WarningPoint {
  timestamp: number;
  componentId: string;
  metric: string;
  value: number;
  threshold: number;
  level: 'warning' | 'critical';
  type: string;
  description?: string;
}

export interface WarningConfig {
  thresholds: WarningThreshold[];
  enabled: boolean;
  autoMark: boolean;
}

export interface ChartMarkLine {
  xAxis?: number;
  yAxis?: number;
  name?: string;
  color?: string;
  lineStyle?: Record<string, any>;
  label?: Record<string, any>;
}

export interface ChartMarkPoint {
  coord?: [number, number];
  name?: string;
  value?: number;
  symbol?: string;
  symbolSize?: number;
  itemStyle?: Record<string, any>;
  label?: Record<string, any>;
}

export interface ChartMarkArea {
  start: { xAxis?: number; yAxis?: number; name?: string; color?: string };
  end: { xAxis?: number; yAxis?: number };
}

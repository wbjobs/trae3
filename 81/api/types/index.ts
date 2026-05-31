export interface MeterDataRequest {
  deviceId: string;
  timestamp: number;
  flowRate: number;
  totalConsumption: number;
  batteryLevel: number;
  signalStrength: number;
  status: 'normal' | 'warning' | 'error' | 'offline';
  nonce?: string;
}

export interface BatchMeterDataRequest {
  data: MeterDataRequest[];
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface ReceiveResponse {
  success: boolean;
  receivedAt: number;
}

export interface DashboardOverview {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  todayAlerts: number;
  todayConsumption: number;
  deviceStatusDistribution: {
    normal: number;
    warning: number;
    error: number;
    offline: number;
  };
  hourlyConsumption: {
    hour: number;
    consumption: number;
  }[];
  recentAlerts: AlertInfo[];
}

export interface AlertInfo {
  id: string;
  deviceId: string;
  deviceSerial: string;
  type: string;
  level: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  status: 'pending' | 'processing' | 'resolved';
  createdAt: string;
}

export interface DeviceFilter {
  status?: string;
  areaId?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface DataFilter {
  deviceId?: string;
  startTime?: number;
  endTime?: number;
  areaId?: string;
}

export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type AnomalyType = 
  | 'flow_spike'
  | 'flow_drop'
  | 'leak_detected'
  | 'no_flow'
  | 'abnormal_consumption'
  | 'reverse_flow';

export interface AnomalyDetectionResult {
  type: AnomalyType;
  level: 'warning' | 'error' | 'critical';
  message: string;
  confidence: number;
  details: Record<string, any>;
}

export interface ConsumptionStats {
  hourly: { hour: number; consumption: number }[];
  daily: { date: string; consumption: number }[];
  weekly: { week: number; consumption: number }[];
  monthly: { month: string; consumption: number }[];
}

export interface TrendReplayRequest {
  deviceId?: string;
  areaId?: string;
  startTime: number;
  endTime: number;
  granularity: '1h' | '6h' | '12h' | '1d' | '1w';
}

export interface TrendReplayDataPoint {
  timestamp: number;
  consumption: number;
  avgFlowRate: number;
  deviceCount: number;
  anomalyCount: number;
}

export interface TrendReplayResponse {
  dataPoints: TrendReplayDataPoint[];
  totalConsumption: number;
  maxConsumption: number;
  avgConsumption: number;
  anomalies: Array<{
    timestamp: number;
    type: AnomalyType;
    level: string;
    message: string;
    deviceCount: number;
  }>;
}

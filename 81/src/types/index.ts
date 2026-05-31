export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
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
  resolvedAt?: string;
}

export interface DeviceInfo {
  id: string;
  serialNumber: string;
  model: string;
  status: 'normal' | 'warning' | 'error' | 'offline';
  batteryLevel: number;
  signalStrength: number;
  lastOnline: string;
  areaName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DeviceDetail extends DeviceInfo {
  area?: AreaInfo;
  recentData: MeterData[];
  recentAlerts: AlertInfo[];
}

export interface MeterData {
  id: string;
  deviceId: string;
  flowRate: number;
  totalConsumption: number;
  timestamp: string;
}

export interface AreaInfo {
  id: string;
  name: string;
  parentId?: string;
  level: number;
}

export interface PaginatedResponse<T> {
  list: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DataFilter {
  deviceId?: string;
  startTime?: number;
  endTime?: number;
  areaId?: string;
  status?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface StatCardData {
  title: string;
  value: string | number;
  unit?: string;
  icon: string;
  color: string;
  trend?: number;
}

export type AnomalyType = 
  | 'flow_spike'
  | 'flow_drop'
  | 'leak_detected'
  | 'no_flow'
  | 'abnormal_consumption'
  | 'reverse_flow'
  | 'battery_low'
  | 'signal_weak'
  | 'device_error'
  | 'flow_abnormal';

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

export const ANOMALY_TYPE_CONFIG: Record<AnomalyType, { label: string; color: string; icon: string }> = {
  flow_spike: { label: '流量突增', color: '#ef4444', icon: 'trending-up' },
  flow_drop: { label: '流量骤降', color: '#f59e0b', icon: 'trending-down' },
  leak_detected: { label: '管道泄漏', color: '#dc2626', icon: 'droplets' },
  no_flow: { label: '无流量', color: '#6b7280', icon: 'minus-circle' },
  abnormal_consumption: { label: '用水异常', color: '#f97316', icon: 'alert-triangle' },
  reverse_flow: { label: '逆向流量', color: '#991b1b', icon: 'arrow-left-circle' },
  battery_low: { label: '低电量', color: '#eab308', icon: 'battery-low' },
  signal_weak: { label: '弱信号', color: '#8b5cf6', icon: 'wifi-off' },
  device_error: { label: '设备故障', color: '#ef4444', icon: 'alert-octagon' },
  flow_abnormal: { label: '流量异常', color: '#f97316', icon: 'activity' }
};

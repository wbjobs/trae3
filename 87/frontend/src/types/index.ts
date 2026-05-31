export interface SensorData {
  timestamp: string;
  device_id: string;
  temperature: number;
  vibration: number;
  pressure: number;
  rpm: number;
  current: number;
}

export interface MetricResult {
  device_id: string;
  parameter: string;
  mean: number;
  std: number;
  min_val: number;
  max_val: number;
  trend: string;
  zscore_anomalies: number;
  window_seconds: number;
  computed_at: string;
}

export interface FaultAlert {
  id: string;
  device_id: string;
  fault_type: string;
  parameter: string;
  value: number;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export interface Device {
  id: string;
  name: string;
  type: string;
}

export interface FilterParams {
  device_id?: string;
  fault_type?: string;
  severity?: string;
  start_time?: string;
  end_time?: string;
  acknowledged?: boolean;
}

export interface WSMessage {
  type: 'realtime_data' | 'fault_alert' | 'metrics_update' | 'metrics' | 'error' | 'subscribed';
  data: unknown;
}

export type ParameterKey = 'temperature' | 'vibration' | 'pressure' | 'rpm' | 'current';

export const PARAMETER_CONFIG: Record<ParameterKey, { label: string; unit: string; color: string }> = {
  temperature: { label: '温度', unit: '°C', color: '#ff4d4f' },
  vibration: { label: '振动', unit: 'mm/s', color: '#faad14' },
  pressure: { label: '压力', unit: 'MPa', color: '#1890ff' },
  rpm: { label: '转速', unit: 'RPM', color: '#52c41a' },
  current: { label: '电流', unit: 'A', color: '#722ed1' },
};

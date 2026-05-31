export interface MetricData {
  timestamp: number;
  metric: string;
  value: number;
  source: string;
  tags?: Record<string, string>;
  is_anomaly?: number;
}

export interface AlertEvent {
  id: string;
  timestamp: number;
  metric: string;
  source: string;
  level: 'critical' | 'warning' | 'info';
  alert_type: string;
  value: number;
  threshold: number;
  duration?: number;
  description: string;
  acknowledged?: number;
}

export interface MetricDefinition {
  name: string;
  display_name: string;
  unit?: string;
  warn_threshold?: number;
  crit_threshold?: number;
  description?: string;
}

export interface DataSource {
  name: string;
  display_name: string;
  type: string;
  status: string;
}

export interface MetricStats {
  metric: string;
  source?: string;
  count: number;
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  anomaly_count: number;
}

export interface AlertStats {
  by_level: Record<string, number>;
  total: number;
  top_metrics: Array<{ metric: string; count: number }>;
}

export interface AggregatedData {
  time_bucket: number;
  count: number;
  min_val: number;
  max_val: number;
  avg_val: number;
  anomaly_count: number;
}

export interface QueryParams {
  startTime: number;
  endTime: number;
  metrics?: string[];
  sources?: string[];
  aggregation?: 'raw' | '1m' | '5m' | '15m' | '1h';
  onlyAnomalies?: boolean;
  limit?: number;
}

export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface AnomalyResult {
  is_anomaly: boolean;
  level?: string;
  alert_type?: string;
  threshold?: number;
  description?: string;
  score?: number;
}

export interface WebSocketMessage {
  type: 'data' | 'alert' | 'latest_values';
  timestamp?: number;
  data?: MetricData | AlertEvent | any;
  anomaly?: AnomalyResult;
}

export interface MetricSummary {
  metric: string;
  source: string;
  value: number;
  timestamp: number;
  avg: number;
  min: number;
  max: number;
  count: number;
  anomaly_count: number;
}

export type TimeRangeKey = '5m' | '15m' | '1h' | '6h' | '24h' | '7d';

export interface FilterState {
  timeRange: TimeRangeKey;
  startTime: number;
  endTime: number;
  selectedMetrics: string[];
  selectedSources: string[];
  aggregation: 'raw' | '1m' | '5m' | '15m' | '1h';
  onlyAnomalies: boolean;
}

export interface PressureAlertEvent extends AlertEvent {
  alert_type: 'pressure_drop' | 'pressure_surge' | 'pressure_stagnation' | 'pressure_leak';
  pipeline_id: string;
  region: string;
  pressure_change_rate: number;
  affected_area: number;
  confidence: number;
}

export interface PipelineData {
  id: string;
  name: string;
  region: string;
  pressure: number;
  flow_rate: number;
  temperature: number;
  status: 'normal' | 'warning' | 'critical';
  last_update: number;
  coordinates: [number, number];
}

export interface RegionData {
  id: string;
  name: string;
  pipelines: string[];
  avg_pressure: number;
  avg_flow: number;
  avg_temperature: number;
  pressure_drop_rate: number;
  warning_count: number;
  critical_count: number;
  status: 'normal' | 'warning' | 'critical';
  color: string;
}

export interface CorrelationResult {
  metric_a: string;
  metric_b: string;
  correlation: number;
  lag: number;
  lag_minutes: number;
  p_value: number;
  significance: 'high' | 'medium' | 'low';
  interpretation: string;
}

export interface HeatmapPoint {
  x: number;
  y: number;
  value: number;
  region: string;
  metric: string;
}

export interface SystemStatus {
  total_pipelines: number;
  active_pipelines: number;
  total_regions: number;
  active_alarms: number;
  system_health: number;
  data_tier: 'hot' | 'warm' | 'cold';
}

export type DataTier = 'hot' | 'warm' | 'cold';

export interface ArchiveStats {
  hot_data_count: number;
  warm_data_count: number;
  cold_data_count: number;
  total_size_mb: number;
  last_archived_at: number;
}

export interface PressureAnalysisResult {
  is_anomaly: boolean;
  level: 'critical' | 'warning' | 'info';
  type: 'pressure_drop' | 'pressure_surge' | 'pressure_stagnation' | 'pressure_leak' | 'normal';
  drop_rate: number;
  duration_minutes: number;
  affected_region: string;
  confidence: number;
  recommended_action: string;
}

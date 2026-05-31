export interface Node {
  node_id: string;
  node_name: string;
  ip_address: string;
  location?: string;
  version?: string;
  priority: number;
  status: 'online' | 'offline' | 'abnormal';
  registered_at?: string;
  last_report?: string;
  cpu_usage?: number;
  memory_usage?: number;
  disk_usage?: number;
}

export interface Metric {
  id?: number;
  node_id: string;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
  network_in: number;
  network_out: number;
  process_count: number;
  created_at?: string;
}

export interface Alert {
  id: number;
  node_id: string;
  alert_type: string;
  alert_level: 'warning' | 'critical';
  message: string;
  severity: number;
  escalation_count: number;
  resolved: boolean;
  created_at?: string;
  resolved_at?: string;
}

export interface StatusHistory {
  id: number;
  node_id: string;
  status: string;
  old_status?: string;
  changed_by: string;
  reason?: string;
  created_at: string;
}

export interface StatsSummary {
  total: number;
  online: number;
  offline: number;
  abnormal: number;
  p1_count: number;
  p2_count: number;
  p3_count: number;
  total_alerts: number;
  active_alerts: number;
  high_severity_alerts: number;
}

export interface LogEntry {
  timestamp: string;
  node_id: string;
  type: string;
  level: 'info' | 'warning' | 'error' | 'debug';
  message: string;
}

export interface MetricPoint {
  timestamp: string;
  cpu_usage: number;
  memory_usage: number;
  disk_usage: number;
}

export interface HistorySummary {
  time_range: {
    start: string;
    end: string;
    hours: number;
  };
  total_status_changes: number;
  total_metrics: number;
  node_status_changes: Record<string, StatusHistory[]>;
  node_metrics_count: Record<string, number>;
}

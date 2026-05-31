import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
});

export interface Log {
  id: number;
  terminal_id: string;
  terminal_name?: string;
  vehicle_number?: string;
  level: string;
  module: string;
  message: string;
  metadata?: Record<string, any>;
  timestamp: string;
}

export interface Terminal {
  id: string;
  name?: string;
  vehicle_number?: string;
  status: 'online' | 'offline';
  last_online: string;
  ip_address?: string;
  created_at: string;
  updated_at: string;
  stats?: {
    total_logs: number;
    error_count: number;
    warning_count: number;
    critical_count: number;
    last_log_time: string;
  };
}

export interface AlertRule {
  id: string;
  name: string;
  type: string;
  keywords: string[];
  levels: string[];
  modules: string[];
  terminalIds: string[];
  enabled: boolean;
  cooldown: number;
  createdAt: string;
}

export interface Alert {
  id: number;
  terminal_id: string;
  type: string;
  message: string;
  level: string;
  rule_name?: string;
  resolved: number;
  created_at: string;
  resolved_at?: string;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}

export interface LogFilterParams extends PaginationParams {
  level?: string;
  terminalId?: string;
  module?: string;
  keyword?: string;
  startTime?: string;
  endTime?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export const logApi = {
  getLogs: (params?: LogFilterParams) =>
    api.get<PaginatedResponse<Log>>('/logs', { params }),

  getStatistics: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/logs/statistics', { params }),

  getLevels: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/logs/levels', { params }),

  getModules: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/logs/modules', { params }),

  getFilterConfig: () => api.get('/logs/filter-config'),

  updateFilterConfig: (config: any) => api.put('/logs/filter-config', config),

  getTimeline: (params: { terminalId?: string; startDate: string; endDate: string }) =>
    api.get<Log[]>('/logs/timeline', { params }),

  clearLogs: (olderThanDays: number) =>
    api.post('/logs/clear', { olderThanDays }),
};

export const terminalApi = {
  getTerminals: (params?: { status?: string } & PaginationParams) =>
    api.get<PaginatedResponse<Terminal>>('/terminals', { params }),

  getTerminal: (id: string) => api.get<Terminal>(`/terminals/${id}`),

  createTerminal: (data: { id: string; name?: string; vehicle_number?: string }) =>
    api.post('/terminals', data),

  updateTerminal: (id: string, data: { name?: string; vehicle_number?: string }) =>
    api.put(`/terminals/${id}`, data),

  deleteTerminal: (id: string) => api.delete(`/terminals/${id}`),

  getTerminalLogs: (id: string, params?: LogFilterParams) =>
    api.get<PaginatedResponse<Log>>(`/terminals/${id}/logs`, { params }),

  getSummary: () => api.get('/terminals/statistics/summary'),
};

export const alertApi = {
  getRules: () => api.get<AlertRule[]>('/alerts/rules'),

  getRule: (id: string) => api.get<AlertRule>(`/alerts/rules/${id}`),

  createRule: (data: Partial<AlertRule>) => api.post<AlertRule>('/alerts/rules', data),

  updateRule: (id: string, data: Partial<AlertRule>) => api.put<AlertRule>(`/alerts/rules/${id}`, data),

  deleteRule: (id: string) => api.delete(`/alerts/rules/${id}`),

  getAlerts: (params?: PaginationParams & { resolved?: number; level?: string }) =>
    api.get<PaginatedResponse<Alert>>('/alerts', { params }),

  resolveAlert: (id: number) => api.put(`/alerts/${id}/resolve`),

  getStatistics: () => api.get('/alerts/statistics'),

  getStreamUrl: () => '/api/alerts/stream',
};

export const partitionApi = {
  getPartitions: () => api.get('/partitions'),

  cleanup: (retentionDays: number) =>
    api.post('/partitions/cleanup', { retentionDays }),
};

export const healthApi = {
  check: () => api.get('/health'),
};

export default api;
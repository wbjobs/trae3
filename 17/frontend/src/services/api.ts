import axios from 'axios';
import type { AxiosResponse, CancelTokenSource } from 'axios';
import type { ApiResponse, KeyMetrics, ComponentData, FaultRecord, ArrayGroup, OperationReport, TimeSeriesPoint } from '@/types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000/api',
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const pendingRequests = new Map<string, CancelTokenSource>();

api.interceptors.request.use((config) => {
  const requestKey = `${config.method}-${config.url}-${JSON.stringify(config.params || config.data)}`;
  const existing = pendingRequests.get(requestKey);
  if (existing) {
    existing.cancel('Request canceled due to duplicate');
  }
  const source = axios.CancelToken.source();
  config.cancelToken = source.token;
  pendingRequests.set(requestKey, source);
  return config;
});

api.interceptors.response.use(
  (response: AxiosResponse<ApiResponse>) => {
    const requestKey = `${response.config.method}-${response.config.url}-${JSON.stringify(response.config.params || response.config.data)}`;
    pendingRequests.delete(requestKey);
    return response.data.data;
  },
  (error) => {
    if (!axios.isCancel(error)) {
      console.error('API Error:', error);
    }
    return Promise.reject(error);
  }
);

export function cancelAllRequests() {
  pendingRequests.forEach((source) => {
    source.cancel('All requests canceled');
  });
  pendingRequests.clear();
}

export interface TimeSeriesQueryParams {
  componentIds: string[];
  metrics: string[];
  startTime: number;
  endTime: number;
  step?: string;
  downsample?: boolean;
  preAggregate?: 'hour' | 'day';
  offset?: number;
  limit?: number;
}

export interface TimeSeriesDataResponse {
  components: Record<string, ComponentData>;
  meta: {
    totalPoints: number;
    downsampledPoints: number;
    step: string;
    preAggregate?: string;
  };
}

export const dataApi = {
  getTimeSeriesData: (params: TimeSeriesQueryParams, signal?: AbortSignal) =>
    api.post<TimeSeriesDataResponse>('/data/timeseries', params, {
      signal,
    }),

  getTimeSeriesIncremental: (params: TimeSeriesQueryParams & { lastTimestamp?: number }) =>
    api.post<TimeSeriesDataResponse>('/data/timeseries/incremental', params),

  getTimeSeriesBatch: (queries: TimeSeriesQueryParams[]) =>
    api.post<TimeSeriesDataResponse[]>('/data/timeseries/batch', { queries }),

  getComponentList: (params?: {
    arrayId?: string;
    groupId?: string;
    status?: string;
  }) => api.get<any>('/data/components', { params }),

  getKeyMetrics: (params?: {
    timeRange?: string;
    groupId?: string;
  }) => api.get<KeyMetrics>('/data/metrics', { params }),

  getCacheStats: () => api.get<any>('/data/cache/stats'),

  clearCache: () => api.post('/data/cache/clear'),
};

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

export const faultApi = {
  getFaultList: (params: {
    startTime?: number;
    endTime?: number;
    severity?: string[];
    faultType?: string[];
    status?: string[];
    componentId?: string;
    page?: number;
    pageSize?: number;
  }) => api.post<any>('/fault/list', params),

  getFaultStatistics: (params: {
    startTime: number;
    endTime: number;
    groupBy: string;
  }) => api.get<any>('/fault/statistics', { params }),

  getFaultHeatmap: (params: {
    startTime: number;
    endTime: number;
  }) => api.get<any[]>('/fault/heatmap', { params }),

  getWarningConfig: () => api.get<WarningConfig>('/fault/warning/config'),

  updateWarningConfig: (config: WarningConfig) => api.put<WarningConfig>('/fault/warning/config', config),

  detectWarnings: (params: {
    componentIds: string[];
    startTime: number;
    endTime: number;
    thresholds: WarningThreshold[];
  }) => api.post<WarningPoint[]>('/fault/warning/detect', params),
};

export const groupApi = {
  getGroups: () => api.get<ArrayGroup[]>('/group/'),

  createGroup: (data: {
    name: string;
    description?: string;
    componentIds: string[];
  }) => api.post<ArrayGroup>('/group/', data),

  updateGroup: (id: string, data: any) => api.put<ArrayGroup>(`/group/${id}`, data),

  deleteGroup: (id: string) => api.delete<void>(`/group/${id}`),

  getGroupStatistics: (groupId: string, params: {
    startTime: number;
    endTime: number;
  }) => api.get<any>(`/group/${groupId}/statistics`, { params }),

  compareGroups: (params: {
    groupIds: string[];
    startTime: number;
    endTime: number;
    metrics: string[];
  }) => api.post<any[]>('/group/compare', params),
};

export const reportApi = {
  getReportList: (params?: {
    status?: string;
    type?: string;
  }) => api.get<OperationReport[]>('/report/', { params }),

  generateReport: (data: {
    name: string;
    type: string;
    format: string;
    startTime: number;
    endTime: number;
    groupIds?: string[];
  }) => api.post<OperationReport>('/report/generate', data),

  downloadReport: (id: string) => api.get(`/report/download/${id}`, {
    responseType: 'blob',
  }),

  deleteReport: (id: string) => api.delete<void>(`/report/${id}`),
};

export const cleaningApi = {
  cleanData: (params: any) => api.post<any>('/cleaning/clean', params),
};

export default api;

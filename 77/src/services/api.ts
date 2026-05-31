import type {
  MetricData,
  AlertEvent,
  MetricDefinition,
  DataSource,
  MetricStats,
  AlertStats,
  QueryParams,
  ApiResponse,
  AggregatedData,
  MetricSummary,
  PipelineData,
  RegionData,
  CorrelationResult,
  HeatmapPoint,
  ArchiveStats,
  PressureAnalysisResult,
  SystemStatus,
} from '@/types';

const API_BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });
  const result = await response.json() as ApiResponse<T>;
  if (result.code !== 200) {
    throw new Error(result.message);
  }
  return result.data;
}

export const api = {
  health: () => request<{ status: string; app: string; version: string; connections: number }>('/health'),

  getMetrics: () => request<MetricDefinition[]>('/metrics/list'),

  getSources: () => request<DataSource[]>('/metrics/sources'),

  getLatestValues: () => request<MetricSummary[]>('/metrics/latest-values'),

  getMetricStats: (params: { startTime: number; endTime: number; metric: string; source?: string }) => {
    const searchParams = new URLSearchParams({
      startTime: params.startTime.toString(),
      endTime: params.endTime.toString(),
      metric: params.metric,
    });
    if (params.source) {
      searchParams.append('source', params.source);
    }
    return request<MetricStats>(`/metrics/stats?${searchParams.toString()}`);
  },

  queryData: (params: QueryParams) => request<MetricData[] | AggregatedData[]>('/data/query', {
    method: 'POST',
    body: JSON.stringify(params),
  }),

  getLatestData: (params?: { metric?: string; source?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.metric) searchParams.append('metric', params.metric);
    if (params?.source) searchParams.append('source', params.source);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const query = searchParams.toString();
    return request<MetricData[]>(`/data/latest${query ? `?${query}` : ''}`);
  },

  getAlerts: (params?: { startTime?: number; endTime?: number; level?: string; limit?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.startTime) searchParams.append('startTime', params.startTime.toString());
    if (params?.endTime) searchParams.append('endTime', params.endTime.toString());
    if (params?.level) searchParams.append('level', params.level);
    if (params?.limit) searchParams.append('limit', params.limit.toString());
    const query = searchParams.toString();
    return request<AlertEvent[]>(`/alerts${query ? `?${query}` : ''}`);
  },

  getAlertStats: (params?: { startTime?: number; endTime?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.startTime) searchParams.append('startTime', params.startTime.toString());
    if (params?.endTime) searchParams.append('endTime', params.endTime.toString());
    const query = searchParams.toString();
    return request<AlertStats>(`/alerts/stats${query ? `?${query}` : ''}`);
  },

  ingestData: (data: Omit<MetricData, 'is_anomaly'>) => request('/data/ingest', {
    method: 'POST',
    body: JSON.stringify(data),
  }),

  getPipelines: () => request<PipelineData[]>('/pressure/pipelines'),

  getPipeline: (id: string) => request<PipelineData>(`/pressure/pipelines/${id}`),

  getRegions: () => request<RegionData[]>('/pressure/regions'),

  getRegion: (name: string) => request<RegionData>(`/pressure/regions/${name}`),

  getHeatmap: (metric?: string) => {
    const query = metric ? `?metric=${metric}` : '';
    return request<HeatmapPoint[]>(`/pressure/heatmap${query}`);
  },

  getCorrelation: (pipeline_a: string, pipeline_b: string) => {
    const query = `?pipeline_a=${pipeline_a}&pipeline_b=${pipeline_b}`;
    return request<CorrelationResult>(`/pressure/correlation${query}`);
  },

  analyzePressure: (params: { pipeline: string; pressure: number; flow_rate: number }) => {
    const query = `?pipeline=${params.pipeline}&pressure=${params.pressure}&flow_rate=${params.flow_rate}`;
    return request<PressureAnalysisResult>(`/pressure/analyze${query}`, { method: 'POST' });
  },

  getPressureAlerts: () => request<AlertEvent[]>('/pressure/alerts/active'),

  getPressureTrend: (pipeline_id: string, hours?: number) => {
    const query = hours ? `?hours=${hours}` : '';
    return request(`/pressure/trend/${pipeline_id}${query}`);
  },

  getArchiveStats: () => request<ArchiveStats>('/archive/stats'),

  triggerArchive: () => request<ArchiveStats>('/archive/trigger', { method: 'POST' }),

  queryArchive: (params: {
    tier: string;
    startTime: number;
    endTime: number;
    metrics?: string[];
    sources?: string[];
    aggregation?: string;
    limit?: number;
  }) => request('/archive/query', {
    method: 'POST',
    body: JSON.stringify(params),
  }),

  getSystemStatus: () => request<SystemStatus>('/archive/status'),
};

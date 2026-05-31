import { create } from 'zustand';
import {
  MetricData,
  AlertEvent,
  MetricDefinition,
  DataSource,
  MetricSummary,
  FilterState,
  TimeRangeKey,
  PipelineData,
  RegionData,
  PressureAnalysisResult,
  CorrelationResult,
  ArchiveStats,
  SystemStatus,
} from '@/types';
import { getTimeRangeMs } from '@/utils/time';

interface MonitorState {
  metrics: MetricDefinition[];
  sources: DataSource[];
  latestData: Map<string, MetricData>;
  metricSummaries: MetricSummary[];
  recentAlerts: AlertEvent[];
  historicalData: MetricData[];
  filters: FilterState;
  wsConnected: boolean;

  pipelines: PipelineData[];
  regions: RegionData[];
  selectedPipeline: string | null;
  pressureAnalysis: PressureAnalysisResult | null;
  correlationResult: CorrelationResult | null;
  archiveStats: ArchiveStats | null;
  systemStatus: SystemStatus | null;

  setMetrics: (metrics: MetricDefinition[]) => void;
  setSources: (sources: DataSource[]) => void;
  addMetricData: (data: MetricData) => void;
  setMetricSummaries: (summaries: MetricSummary[]) => void;
  addAlert: (alert: AlertEvent) => void;
  setAlerts: (alerts: AlertEvent[]) => void;
  setHistoricalData: (data: MetricData[]) => void;
  setWsConnected: (connected: boolean) => void;

  setPipelines: (pipelines: PipelineData[]) => void;
  setRegions: (regions: RegionData[]) => void;
  setSelectedPipeline: (id: string | null) => void;
  setPressureAnalysis: (analysis: PressureAnalysisResult | null) => void;
  setCorrelationResult: (result: CorrelationResult | null) => void;
  setArchiveStats: (stats: ArchiveStats | null) => void;
  setSystemStatus: (status: SystemStatus | null) => void;

  setTimeRange: (range: TimeRangeKey) => void;
  setSelectedMetrics: (metrics: string[]) => void;
  setSelectedSources: (sources: string[]) => void;
  setAggregation: (agg: FilterState['aggregation']) => void;
  setOnlyAnomalies: (value: boolean) => void;
  toggleMetric: (metric: string) => void;
  toggleSource: (source: string) => void;
}

const now = Date.now();
const defaultFilters: FilterState = {
  timeRange: '1h',
  startTime: now - getTimeRangeMs('1h'),
  endTime: now,
  selectedMetrics: [],
  selectedSources: [],
  aggregation: '1m',
  onlyAnomalies: false,
};

export const useMonitorStore = create<MonitorState>((set, get) => ({
  metrics: [],
  sources: [],
  latestData: new Map(),
  metricSummaries: [],
  recentAlerts: [],
  historicalData: [],
  filters: defaultFilters,
  wsConnected: false,

  pipelines: [],
  regions: [],
  selectedPipeline: null,
  pressureAnalysis: null,
  correlationResult: null,
  archiveStats: null,
  systemStatus: null,

  setMetrics: (metrics) => set({ metrics }),
  setSources: (sources) => set({ sources }),

  addMetricData: (data) => {
    const key = `${data.metric}:${data.source}`;
    set((state) => {
      const newLatestData = new Map(state.latestData);
      newLatestData.set(key, data);
      return { latestData: newLatestData };
    });
  },

  setMetricSummaries: (summaries) => set({ metricSummaries: summaries }),

  addAlert: (alert) => {
    set((state) => {
      const exists = state.recentAlerts.some(a => a.id === alert.id);
      if (exists) return {};
      return { recentAlerts: [alert, ...state.recentAlerts].slice(0, 100) };
    });
  },

  setAlerts: (alerts) => set({ recentAlerts: alerts }),

  setHistoricalData: (data) => set({ historicalData: data }),

  setWsConnected: (wsConnected) => set({ wsConnected }),

  setTimeRange: (range) => {
    const now = Date.now();
    set({
      filters: {
        ...get().filters,
        timeRange: range,
        startTime: now - getTimeRangeMs(range),
        endTime: now,
      },
    });
  },

  setSelectedMetrics: (metrics) => {
    set({
      filters: { ...get().filters, selectedMetrics: metrics },
    });
  },

  setSelectedSources: (sources) => {
    set({
      filters: { ...get().filters, selectedSources: sources },
    });
  },

  setAggregation: (agg) => {
    set({
      filters: { ...get().filters, aggregation: agg },
    });
  },

  setOnlyAnomalies: (value) => {
    set({
      filters: { ...get().filters, onlyAnomalies: value },
    });
  },

  toggleMetric: (metric) => {
    const { selectedMetrics } = get().filters;
    const newMetrics = selectedMetrics.includes(metric)
      ? selectedMetrics.filter(m => m !== metric)
      : [...selectedMetrics, metric];
    set({ filters: { ...get().filters, selectedMetrics: newMetrics } });
  },

  toggleSource: (source) => {
    const { selectedSources } = get().filters;
    const newSources = selectedSources.includes(source)
      ? selectedSources.filter(s => s !== source)
      : [...selectedSources, source];
    set({ filters: { ...get().filters, selectedSources: newSources } });
  },

  setPipelines: (pipelines) => set({ pipelines }),
  setRegions: (regions) => set({ regions }),
  setSelectedPipeline: (id) => set({ selectedPipeline: id }),
  setPressureAnalysis: (analysis) => set({ pressureAnalysis: analysis }),
  setCorrelationResult: (result) => set({ correlationResult: result }),
  setArchiveStats: (stats) => set({ archiveStats: stats }),
  setSystemStatus: (status) => set({ systemStatus: status }),
}));

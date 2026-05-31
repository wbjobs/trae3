import { useEffect, useRef, useCallback, useState } from 'react';
import { debounce } from 'lodash-es';
import type { TimeSeriesPoint } from '@/types';
import { dataApi } from '@/services/api';

function extractComponentData(result: any): Record<string, TimeSeriesPoint[]> {
  if (!result) return {};
  if (result.components && typeof result.components === 'object') {
    const data: Record<string, TimeSeriesPoint[]> = {};
    Object.keys(result.components).forEach((key) => {
      const comp = result.components[key];
      if (comp && typeof comp === 'object') {
        Object.keys(comp).forEach((metric) => {
          const points = (comp as any)[metric];
          if (Array.isArray(points) && points.length > 0) {
            const combinedKey = `${key}_${metric}`;
            data[combinedKey] = points;
          }
        });
      }
    });
    return data;
  }
  if (typeof result === 'object' && !Array.isArray(result)) {
    return result as Record<string, TimeSeriesPoint[]>;
  }
  return {};
}

export type RefreshStrategy = 'full' | 'incremental' | 'viewport';

export interface ChartRefreshConfig {
  strategy: RefreshStrategy;
  interval?: number;
  debounceMs?: number;
  componentIds: string[];
  metrics: string[];
  startTime: number;
  endTime: number;
  step?: string;
}

export interface ChartRefreshResult {
  data: Record<string, TimeSeriesPoint[]>;
  loading: boolean;
  lastTimestamp: number | null;
  refresh: () => void;
  updateViewport: (start: number, end: number) => void;
  updateStrategy: (strategy: RefreshStrategy) => void;
}

export function useIntervalRefresh(config: ChartRefreshConfig): ChartRefreshResult {
  const [data, setData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [lastTimestamp, setLastTimestamp] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<RefreshStrategy>(config.strategy);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const fetchData = useCallback(async (isIncremental: boolean) => {
    const currentConfig = configRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const effectiveStart = isIncremental && lastTimestamp
        ? lastTimestamp
        : currentConfig.startTime;

      const result = await dataApi.getTimeSeriesData({
        componentIds: currentConfig.componentIds,
        metrics: currentConfig.metrics,
        startTime: effectiveStart,
        endTime: currentConfig.endTime,
        step: currentConfig.step,
      });

      if (controller.signal.aborted) return;

      const extractedData = extractComponentData(result);
      
      if (isIncremental && lastTimestamp) {
        setData(prev => {
          const merged = { ...prev };
          Object.keys(extractedData).forEach(key => {
            const newPoints = extractedData[key];
            if (Array.isArray(newPoints)) {
              merged[key] = [...(merged[key] || []), ...newPoints];
            }
          });
          return merged;
        });
      } else {
        setData(extractedData);
      }

      const now = Date.now();
      setLastTimestamp(now);
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        console.error('Interval refresh error:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [lastTimestamp]);

  const refresh = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    fetchData(strategy === 'incremental');
  }, [fetchData, strategy]);

  const updateViewport = useCallback((_start: number, _end: number) => {
    if (strategy === 'viewport') {
      refresh();
    }
  }, [strategy, refresh]);

  const updateStrategy = useCallback((newStrategy: RefreshStrategy) => {
    setStrategy(newStrategy);
  }, []);

  useEffect(() => {
    refresh();
  }, [config.componentIds, config.metrics, config.startTime, config.endTime]);

  useEffect(() => {
    if (!config.interval || config.interval <= 0) return;

    timerRef.current = setInterval(() => {
      fetchData(strategy === 'incremental');
    }, config.interval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [config.interval, strategy, fetchData]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return {
    data,
    loading,
    lastTimestamp,
    refresh,
    updateViewport,
    updateStrategy,
  };
}

export interface ViewportRefreshConfig {
  componentIds: string[];
  metrics: string[];
  startTime: number;
  endTime: number;
  step?: string;
  debounceMs?: number;
}

export function useViewportRefresh(config: ViewportRefreshConfig) {
  const [data, setData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const fetchViewportData = useCallback(async (zoomStart: number, zoomEnd: number) => {
    const currentConfig = configRef.current;
    const totalRange = currentConfig.endTime - currentConfig.startTime;
    const viewStartTime = currentConfig.startTime + totalRange * (zoomStart / 100);
    const viewEndTime = currentConfig.startTime + totalRange * (zoomEnd / 100);

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const result = await dataApi.getTimeSeriesData({
        componentIds: currentConfig.componentIds,
        metrics: currentConfig.metrics,
        startTime: viewStartTime,
        endTime: viewEndTime,
        step: currentConfig.step,
      });

      if (controller.signal.aborted) return;
      setData(extractComponentData(result));
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        console.error('Viewport refresh error:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedFetch = useRef(
    debounce(fetchViewportData, config.debounceMs ?? 300)
  ).current;

  const onZoomChange = useCallback((start: number, end: number) => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    debouncedFetch(start, end);
  }, [debouncedFetch]);

  useEffect(() => {
    fetchViewportData(0, 100);
  }, [config.componentIds, config.metrics, config.startTime, config.endTime]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      debouncedFetch.cancel();
    };
  }, [debouncedFetch]);

  return {
    data,
    loading,
    onZoomChange,
  };
}

export interface DebouncedRefreshConfig {
  componentIds: string[];
  metrics: string[];
  startTime: number;
  endTime: number;
  step?: string;
  debounceMs?: number;
}

export function useDebouncedRefresh(config: DebouncedRefreshConfig) {
  const [data, setData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const configRef = useRef(config);
  configRef.current = config;

  const fetchData = useCallback(async () => {
    const currentConfig = configRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const result = await dataApi.getTimeSeriesData({
        componentIds: currentConfig.componentIds,
        metrics: currentConfig.metrics,
        startTime: currentConfig.startTime,
        endTime: currentConfig.endTime,
        step: currentConfig.step,
      });

      if (controller.signal.aborted) return;
      setData(extractComponentData(result));
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        console.error('Debounced refresh error:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const debouncedRefresh = useRef(
    debounce(fetchData, config.debounceMs ?? 500)
  ).current;

  const refresh = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    debouncedRefresh();
  }, [debouncedRefresh]);

  useEffect(() => {
    fetchData();
  }, [config.componentIds, config.metrics, config.startTime, config.endTime]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      debouncedRefresh.cancel();
    };
  }, [debouncedRefresh]);

  return {
    data,
    loading,
    refresh,
  };
}

import { useState, useRef, useCallback, useEffect } from 'react';
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

export interface BatchDataLoaderConfig {
  componentIds: string[];
  metrics: string[];
  startTime: number;
  endTime: number;
  step?: string;
  pageSize?: number;
  preloadPages?: number;
  onProgress?: (current: number, total: number) => void;
}

interface PendingRequest {
  key: string;
  abortController: AbortController;
}

const DEFAULT_PAGE_SIZE = 10000;

export function useBatchDataLoader(config: BatchDataLoaderConfig) {
  const [data, setData] = useState<Record<string, TimeSeriesPoint[]>>({});
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const abortRef = useRef<AbortController | null>(null);
  const pendingRequests = useRef<Map<string, Promise<any>>>(new Map());
  const configRef = useRef(config);
  configRef.current = config;

  const totalPages = Math.ceil(
    (config.endTime - config.startTime) / (config.pageSize ?? DEFAULT_PAGE_SIZE)
  );

  const buildRequestKey = useCallback(
    (start: number, end: number) => `${start}-${end}-${config.componentIds.join(',')}`,
    [config.componentIds]
  );

  const loadPage = useCallback(
    async (pageStart: number, pageEnd: number, signal?: AbortSignal) => {
      const key = buildRequestKey(pageStart, pageEnd);

      const existing = pendingRequests.current.get(key);
      if (existing) return existing;

      const promise = dataApi.getTimeSeriesData({
        componentIds: configRef.current.componentIds,
        metrics: configRef.current.metrics,
        startTime: pageStart,
        endTime: pageEnd,
        step: configRef.current.step,
      });

      pendingRequests.current.set(key, promise);

      try {
        const result = await promise;
        if (signal?.aborted) return null;
        return extractComponentData(result);
      } finally {
        pendingRequests.current.delete(key);
      }
    },
    [buildRequestKey]
  );

  const loadAllPages = useCallback(async () => {
    const currentConfig = configRef.current;
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setProgress({ current: 0, total: totalPages });

    const pageSize = currentConfig.pageSize ?? DEFAULT_PAGE_SIZE;
    const allData: Record<string, TimeSeriesPoint[]> = {};
    let loadedPages = 0;

    try {
      for (let start = currentConfig.startTime; start < currentConfig.endTime; start += pageSize) {
        if (controller.signal.aborted) break;

        const end = Math.min(start + pageSize, currentConfig.endTime);
        const result = await loadPage(start, end, controller.signal);

        if (result && typeof result === 'object') {
          Object.keys(result).forEach((key) => {
            const points = result[key];
            if (Array.isArray(points)) {
              if (!allData[key]) {
                allData[key] = [];
              }
              allData[key] = [...allData[key], ...points];
            }
          });
        }

        loadedPages++;
        setProgress({ current: loadedPages, total: totalPages });
        currentConfig.onProgress?.(loadedPages, totalPages);

        if (loadedPages % (currentConfig.preloadPages ?? 1) === 0) {
          setData({ ...allData });
        }
      }

      if (!controller.signal.aborted) {
        setData(allData);
      }
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        console.error('Batch load error:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [totalPages, loadPage]);

  const loadMore = useCallback(async () => {
    const currentData = Object.values(data);
    if (currentData.length === 0) return;

    const maxTimestamp = Math.max(
      ...currentData.flatMap(arr =>
        Array.isArray(arr) ? arr.map(p => p.timestamp).filter(Boolean) : [0]
      )
    );

    if (maxTimestamp >= config.endTime) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const result = await dataApi.getTimeSeriesData({
        componentIds: configRef.current.componentIds,
        metrics: configRef.current.metrics,
        startTime: maxTimestamp,
        endTime: config.endTime,
        step: configRef.current.step,
      });

      if (controller.signal.aborted || !result) return;

      const extracted = extractComponentData(result);
      setData(prev => {
        const merged = { ...prev };
        Object.keys(extracted).forEach(key => {
          const newPoints = extracted[key];
          if (Array.isArray(newPoints)) {
            merged[key] = [...(merged[key] || []), ...newPoints];
          }
        });
        return merged;
      });
    } catch (err: any) {
      if (err?.name !== 'CanceledError' && err?.name !== 'AbortError') {
        console.error('Load more error:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [data, config.endTime]);

  const refresh = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    pendingRequests.current.clear();
    loadAllPages();
  }, [loadAllPages]);

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    pendingRequests.current.clear();
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAllPages();
  }, [config.componentIds, config.metrics, config.startTime, config.endTime]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      pendingRequests.current.clear();
    };
  }, []);

  return {
    data,
    loading,
    progress,
    loadMore,
    refresh,
    cancel,
  };
}

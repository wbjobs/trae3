import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type { TimeSeriesPoint, WarningThreshold, WarningPoint, ChartMarkLine, ChartMarkPoint, ChartMarkArea } from '@/types';
import { faultApi } from '@/services/api';

const DEFAULT_THRESHOLDS: WarningThreshold[] = [
  {
    metric: 'voltage',
    warningLow: 280,
    warningHigh: 450,
    criticalLow: 250,
    criticalHigh: 500,
  },
  {
    metric: 'current',
    warningLow: 2,
    warningHigh: 15,
    criticalLow: 1,
    criticalHigh: 18,
  },
  {
    metric: 'temperature',
    warningHigh: 65,
    criticalHigh: 80,
  },
];

export interface WarningDetectionConfig {
  componentIds: string[];
  metrics: string[];
  startTime: number;
  endTime: number;
  thresholds?: WarningThreshold[];
  autoDetect?: boolean;
  checkInterval?: number;
}

export interface WarningDetectionResult {
  warnings: WarningPoint[];
  warningCount: number;
  criticalCount: number;
  byLevel: { warning: WarningPoint[]; critical: WarningPoint[] };
  byMetric: Record<string, WarningPoint[]>;
  byComponent: Record<string, WarningPoint[]>;
  markLines: ChartMarkLine[];
  markPoints: ChartMarkPoint[];
  markAreas: ChartMarkArea[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  detectWarnings: (data: Record<string, TimeSeriesPoint[]>) => WarningPoint[];
}

function detectWarningsLocal(
  data: Record<string, TimeSeriesPoint[]>,
  thresholds: WarningThreshold[]
): WarningPoint[] {
  const warnings: WarningPoint[] = [];

  Object.keys(data).forEach((componentId) => {
    const points = data[componentId];
    if (!Array.isArray(points) || points.length === 0) return;

    points.forEach((point) => {
      const { timestamp, value } = point;
      if (typeof value !== 'number' || isNaN(value)) return;

      thresholds.forEach((threshold) => {
        const { metric, warningLow, warningHigh, criticalLow, criticalHigh } = threshold;

        if (criticalHigh !== undefined && value > criticalHigh) {
          warnings.push({
            timestamp,
            componentId,
            metric,
            value,
            threshold: criticalHigh,
            level: 'critical',
            type: `${metric}_high_critical`,
            description: `${metric} 严重过高: ${value.toFixed(2)} > ${criticalHigh}`,
          });
        } else if (warningHigh !== undefined && value > warningHigh) {
          warnings.push({
            timestamp,
            componentId,
            metric,
            value,
            threshold: warningHigh,
            level: 'warning',
            type: `${metric}_high_warning`,
            description: `${metric} 过高: ${value.toFixed(2)} > ${warningHigh}`,
          });
        }

        if (criticalLow !== undefined && value < criticalLow) {
          warnings.push({
            timestamp,
            componentId,
            metric,
            value,
            threshold: criticalLow,
            level: 'critical',
            type: `${metric}_low_critical`,
            description: `${metric} 严重过低: ${value.toFixed(2)} < ${criticalLow}`,
          });
        } else if (warningLow !== undefined && value < warningLow) {
          warnings.push({
            timestamp,
            componentId,
            metric,
            value,
            threshold: warningLow,
            level: 'warning',
            type: `${metric}_low_warning`,
            description: `${metric} 过低: ${value.toFixed(2)} < ${warningLow}`,
          });
        }
      });
    });
  });

  return warnings;
}

export function useWarningDetection(config: WarningDetectionConfig): WarningDetectionResult {
  const {
    componentIds,
    metrics,
    startTime,
    endTime,
    thresholds = DEFAULT_THRESHOLDS,
    autoDetect = true,
    checkInterval,
  } = config;

  const [warnings, setWarnings] = useState<WarningPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const detectWarnings = useCallback(
    (data: Record<string, TimeSeriesPoint[]>) => {
      return detectWarningsLocal(data, thresholds);
    },
    [thresholds]
  );

  const fetchWarnings = useCallback(async () => {
    if (!autoDetect || componentIds.length === 0 || metrics.length === 0) return;

    if (abortRef.current) {
      abortRef.current.abort();
    }
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await faultApi.detectWarnings({
        componentIds,
        startTime,
        endTime,
        thresholds,
      });
      setWarnings(Array.isArray(result) ? result : []);
    } catch (err: any) {
      if (err?.name !== 'AbortError' && err?.name !== 'CanceledError') {
        console.error('Warning detection error:', err);
        setError(err?.message || '预警检测失败');
      }
    } finally {
      setLoading(false);
    }
  }, [componentIds, metrics, startTime, endTime, thresholds, autoDetect]);

  const refresh = useCallback(async () => {
    await fetchWarnings();
  }, [fetchWarnings]);

  const byLevel = useMemo(() => ({
    warning: warnings.filter((w) => w.level === 'warning'),
    critical: warnings.filter((w) => w.level === 'critical'),
  }), [warnings]);

  const byMetric = useMemo(() => {
    const result: Record<string, WarningPoint[]> = {};
    warnings.forEach((w) => {
      if (!result[w.metric]) {
        result[w.metric] = [];
      }
      result[w.metric].push(w);
    });
    return result;
  }, [warnings]);

  const byComponent = useMemo(() => {
    const result: Record<string, WarningPoint[]> = {};
    warnings.forEach((w) => {
      if (!result[w.componentId]) {
        result[w.componentId] = [];
      }
      result[w.componentId].push(w);
    });
    return result;
  }, [warnings]);

  const markLines = useMemo((): ChartMarkLine[] => {
    const lines: ChartMarkLine[] = [];

    thresholds.forEach((threshold) => {
      const { metric, warningLow, warningHigh, criticalLow, criticalHigh } = threshold;

      if (criticalHigh !== undefined) {
        lines.push({
          yAxis: criticalHigh,
          name: `${metric} 严重高`,
          color: '#ff4d4f',
          lineStyle: { type: 'dashed', width: 2 },
          label: { position: 'insideEndTop', fontSize: 10 },
        });
      }
      if (warningHigh !== undefined) {
        lines.push({
          yAxis: warningHigh,
          name: `${metric} 警告高`,
          color: '#faad14',
          lineStyle: { type: 'dashed', width: 1 },
          label: { position: 'insideEndTop', fontSize: 10 },
        });
      }
      if (criticalLow !== undefined) {
        lines.push({
          yAxis: criticalLow,
          name: `${metric} 严重低`,
          color: '#ff4d4f',
          lineStyle: { type: 'dashed', width: 2 },
          label: { position: 'insideEndBottom', fontSize: 10 },
        });
      }
      if (warningLow !== undefined) {
        lines.push({
          yAxis: warningLow,
          name: `${metric} 警告低`,
          color: '#faad14',
          lineStyle: { type: 'dashed', width: 1 },
          label: { position: 'insideEndBottom', fontSize: 10 },
        });
      }
    });

    return lines;
  }, [thresholds]);

  const markPoints = useMemo((): ChartMarkPoint[] => {
    return warnings.map((warning) => ({
      coord: [warning.timestamp, warning.value],
      name: warning.type,
      value: warning.value,
      symbol: 'pin',
      symbolSize: warning.level === 'critical' ? 50 : 35,
      itemStyle: {
        color: warning.level === 'critical' ? '#ff4d4f' : '#faad14',
      },
      label: {
        show: true,
        fontSize: 9,
        formatter: warning.level === 'critical' ? '!' : '',
      },
    }));
  }, [warnings]);

  const markAreas = useMemo((): ChartMarkArea[] => {
    const areas: ChartMarkArea[] = [];

    thresholds.forEach((threshold) => {
      const { metric, warningHigh, criticalHigh } = threshold;

      if (criticalHigh !== undefined && warningHigh !== undefined) {
        areas.push({
          start: {
            yAxis: warningHigh,
            name: `${metric} 危险区`,
            color: '#ff4d4f20',
          },
          end: { yAxis: criticalHigh * 1.1 },
        });
      }
    });

    return areas;
  }, [thresholds]);

  useEffect(() => {
    fetchWarnings();
  }, [fetchWarnings]);

  useEffect(() => {
    if (!checkInterval || checkInterval <= 0) return;

    timerRef.current = setInterval(fetchWarnings, checkInterval);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [checkInterval, fetchWarnings]);

  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  return {
    warnings,
    warningCount: byLevel.warning.length,
    criticalCount: byLevel.critical.length,
    byLevel,
    byMetric,
    byComponent,
    markLines,
    markPoints,
    markAreas,
    loading,
    error,
    refresh,
    detectWarnings,
  };
}

export function createWarningMarkers(warnings: WarningPoint[]): {
  markLines: ChartMarkLine[];
  markPoints: ChartMarkPoint[];
  markAreas: ChartMarkArea[];
} {
  const markPoints: ChartMarkPoint[] = warnings.map((warning) => ({
    coord: [warning.timestamp, warning.value],
    name: warning.type,
    value: warning.value,
    symbol: 'pin',
    symbolSize: warning.level === 'critical' ? 50 : 35,
    itemStyle: {
      color: warning.level === 'critical' ? '#ff4d4f' : '#faad14',
    },
    label: {
      show: true,
      fontSize: 9,
      formatter: warning.level === 'critical' ? '!' : '',
    },
  }));

  return {
    markLines: [],
    markPoints,
    markAreas: [],
  };
}

export function getDefaultWarningThresholds(): WarningThreshold[] {
  return DEFAULT_THRESHOLDS;
}

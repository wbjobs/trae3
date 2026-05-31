import { useEffect, useState, useCallback } from 'react';
import { useMonitorStore } from '@/store/useMonitorStore';
import { api } from '@/services/api';
import FilterBar from '@/components/FilterBar';
import LazyChart from '@/components/LazyChart';
import type { MetricData, AggregatedData } from '@/types';

export default function Charts() {
  const { metrics, filters, setMetrics } = useMonitorStore();
  const [chartData, setChartData] = useState<Map<string, MetricData[] | AggregatedData[]>>(new Map());
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const metricsToQuery = filters.selectedMetrics.length > 0
        ? filters.selectedMetrics
        : metrics.map(m => m.name);

      const newChartData = new Map();

      for (const metricName of metricsToQuery) {
        const params = {
          startTime: filters.startTime,
          endTime: filters.endTime,
          metrics: [metricName],
          sources: filters.selectedSources.length > 0 ? filters.selectedSources : undefined,
          aggregation: filters.aggregation,
          onlyAnomalies: filters.onlyAnomalies,
        };
        const data = await api.queryData(params);
        newChartData.set(metricName, data);
      }

      setChartData(newChartData);
    } catch (error) {
      console.error('Failed to load chart data:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, metrics]);

  useEffect(() => {
    const loadMetrics = async () => {
      const data = await api.getMetrics();
      setMetrics(data);
    };
    loadMetrics();
  }, [setMetrics]);

  useEffect(() => {
    if (metrics.length > 0) {
      loadData();
    }
  }, [filters, metrics.length, loadData]);

  const metricsToShow = filters.selectedMetrics.length > 0
    ? metrics.filter(m => filters.selectedMetrics.includes(m.name))
    : metrics;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">图表分析</h1>
        <p className="text-gray-400">多维度数据可视化分析和历史趋势查看</p>
      </div>

      <FilterBar />

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {metricsToShow.map((metric) => {
            const data = chartData.get(metric.name) || [];
            return (
              <LazyChart
                key={metric.name}
                metric={metric}
                data={data}
                height={300}
              />
            );
          })}
        </div>
      )}

      {!loading && metricsToShow.length === 0 && (
        <div className="text-center py-16 text-gray-500">
          <p>请选择要查看的指标</p>
        </div>
      )}
    </div>
  );
}

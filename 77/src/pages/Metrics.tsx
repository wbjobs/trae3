import { useEffect, useState, useCallback } from 'react';
import { Settings, TrendingUp, TrendingDown, Activity, AlertTriangle, Database } from 'lucide-react';
import { useMonitorStore } from '@/store/useMonitorStore';
import { api } from '@/services/api';
import FilterBar from '@/components/FilterBar';
import MetricChart from '@/components/MetricChart';
import type { MetricStats, MetricData, AggregatedData } from '@/types';
import { formatNumber } from '@/utils/format';

export default function Metrics() {
  const { metrics, sources, filters, setMetrics, setSources } = useMonitorStore();
  const [selectedMetric, setSelectedMetric] = useState<string>('');
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [stats, setStats] = useState<MetricStats | null>(null);
  const [chartData, setChartData] = useState<MetricData[] | AggregatedData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadInitial = async () => {
      const [metricsRes, sourcesRes] = await Promise.all([
        api.getMetrics(),
        api.getSources(),
      ]);
      setMetrics(metricsRes);
      setSources(sourcesRes);
      if (metricsRes.length > 0) {
        setSelectedMetric(metricsRes[0].name);
      }
      if (sourcesRes.length > 0) {
        setSelectedSource(sourcesRes[0].name);
      }
    };
    loadInitial();
  }, [setMetrics, setSources]);

  const loadData = useCallback(async () => {
    if (!selectedMetric) return;
    setLoading(true);
    try {
      const [statsRes, dataRes] = await Promise.all([
        api.getMetricStats({
          startTime: filters.startTime,
          endTime: filters.endTime,
          metric: selectedMetric,
          source: selectedSource || undefined,
        }),
        api.queryData({
          startTime: filters.startTime,
          endTime: filters.endTime,
          metrics: [selectedMetric],
          sources: selectedSource ? [selectedSource] : undefined,
          aggregation: filters.aggregation,
          onlyAnomalies: filters.onlyAnomalies,
        }),
      ]);
      setStats(statsRes);
      setChartData(dataRes);
    } catch (error) {
      console.error('Failed to load metric data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedMetric, selectedSource, filters]);

  useEffect(() => {
    if (selectedMetric) {
      loadData();
    }
  }, [selectedMetric, selectedSource, filters, loadData]);

  const currentMetric = metrics.find(m => m.name === selectedMetric);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">指标详情</h1>
        <p className="text-gray-400">单个指标的深度分析和详细统计</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <label className="block text-sm text-gray-400 mb-2">选择指标</label>
          <select
            value={selectedMetric}
            onChange={(e) => setSelectedMetric(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-bg-tertiary border border-border-glow text-white focus:outline-none focus:border-accent-cyan/50"
          >
            {metrics.map((m) => (
              <option key={m.name} value={m.name}>
                {m.display_name} ({m.name})
              </option>
            ))}
          </select>
        </div>
        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
          <label className="block text-sm text-gray-400 mb-2">选择数据源</label>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="w-full px-4 py-2 rounded-lg bg-bg-tertiary border border-border-glow text-white focus:outline-none focus:border-accent-cyan/50"
          >
            <option value="">全部数据源</option>
            {sources.map((s) => (
              <option key={s.name} value={s.name}>
                {s.display_name} ({s.type})
              </option>
            ))}
          </select>
        </div>
      </div>

      <FilterBar />

      {currentMetric && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 text-center">
            <Database className="w-5 h-5 mx-auto mb-2 text-accent-cyan" />
            <p className="text-xs text-gray-500">数据点</p>
            <p className="text-xl font-bold font-number text-white">{stats?.count || 0}</p>
          </div>
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 text-center">
            <Activity className="w-5 h-5 mx-auto mb-2 text-status-success" />
            <p className="text-xs text-gray-500">平均值</p>
            <p className="text-xl font-bold font-number text-status-success">
              {formatNumber(stats?.avg || 0)}
            </p>
          </div>
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 text-center">
            <TrendingDown className="w-5 h-5 mx-auto mb-2 text-blue-400" />
            <p className="text-xs text-gray-500">最小值</p>
            <p className="text-xl font-bold font-number text-blue-400">
              {formatNumber(stats?.min || 0)}
            </p>
          </div>
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 text-center">
            <TrendingUp className="w-5 h-5 mx-auto mb-2 text-status-warning" />
            <p className="text-xs text-gray-500">最大值</p>
            <p className="text-xl font-bold font-number text-status-warning">
              {formatNumber(stats?.max || 0)}
            </p>
          </div>
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 text-center">
            <Settings className="w-5 h-5 mx-auto mb-2 text-purple-400" />
            <p className="text-xs text-gray-500">中位数</p>
            <p className="text-xl font-bold font-number text-purple-400">
              {formatNumber(stats?.p50 || 0)}
            </p>
          </div>
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 text-center">
            <Settings className="w-5 h-5 mx-auto mb-2 text-cyan-400" />
            <p className="text-xs text-gray-500">P95</p>
            <p className="text-xl font-bold font-number text-cyan-400">
              {formatNumber(stats?.p95 || 0)}
            </p>
          </div>
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 text-center">
            <Settings className="w-5 h-5 mx-auto mb-2 text-pink-400" />
            <p className="text-xs text-gray-500">P99</p>
            <p className="text-xl font-bold font-number text-pink-400">
              {formatNumber(stats?.p99 || 0)}
            </p>
          </div>
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 text-center">
            <AlertTriangle className="w-5 h-5 mx-auto mb-2 text-status-error" />
            <p className="text-xs text-gray-500">异常次数</p>
            <p className="text-xl font-bold font-number text-status-error">
              {stats?.anomaly_count || 0}
            </p>
          </div>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && currentMetric && (
        <MetricChart
          metric={currentMetric}
          data={chartData}
          height={400}
          showLegend={false}
        />
      )}

      {currentMetric && (
        <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-6">
          <h3 className="font-medium mb-4">指标信息</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500">指标名称</p>
              <p className="font-medium">{currentMetric.display_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">指标编码</p>
              <p className="font-mono text-accent-cyan">{currentMetric.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">单位</p>
              <p className="font-medium">{currentMetric.unit || '-'}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">警告阈值</p>
              <p className="font-medium text-status-warning">
                {currentMetric.warn_threshold || '-'} {currentMetric.unit}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">临界阈值</p>
              <p className="font-medium text-status-error">
                {currentMetric.crit_threshold || '-'} {currentMetric.unit}
              </p>
            </div>
            <div className="md:col-span-2">
              <p className="text-sm text-gray-500">描述</p>
              <p className="font-medium">{currentMetric.description || '-'}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

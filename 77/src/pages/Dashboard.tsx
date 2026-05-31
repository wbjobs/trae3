import { useEffect, useState } from 'react';
import { Activity, AlertTriangle, Database, Cpu, Zap } from 'lucide-react';
import { useMonitorStore } from '@/store/useMonitorStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/services/api';
import MetricCard from '@/components/MetricCard';
import FilterBar from '@/components/FilterBar';
import StatsCard from '@/components/StatsCard';
import AlertItem from '@/components/AlertItem';
import type { MetricData, AlertEvent, MetricSummary } from '@/types';

export default function Dashboard() {
  const {
    metrics,
    sources,
    setMetrics,
    setSources,
    addMetricData,
    addAlert,
    setAlerts,
    setMetricSummaries,
    setWsConnected,
  } = useMonitorStore();

  const [loading, setLoading] = useState(true);
  const [summaries, setSummaries] = useState<MetricSummary[]>([]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [metricsRes, sourcesRes, alertsRes] = await Promise.all([
          api.getMetrics(),
          api.getSources(),
          api.getAlerts({ limit: 10 }),
        ]);
        setMetrics(metricsRes);
        setSources(sourcesRes);
        setAlerts(alertsRes);
      } catch (error) {
        console.error('Failed to load initial data:', error);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, [setMetrics, setSources, setAlerts]);

  useWebSocket({
    onData: (data: MetricData) => {
      addMetricData(data);
    },
    onAlert: (alert: AlertEvent) => {
      addAlert(alert);
    },
    onLatestValues: (values: MetricSummary[]) => {
      setMetricSummaries(values);
      setSummaries(values);
    },
    onOpen: () => setWsConnected(true),
    onClose: () => setWsConnected(false),
  });

  const recentAlerts = useMonitorStore((state) => state.recentAlerts);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-accent-cyan">
          <Activity className="w-8 h-8 animate-spin" />
          <span className="text-lg">加载中...</span>
        </div>
      </div>
    );
  }

  const totalDataPoints = summaries.reduce((sum, s) => sum + s.count, 0);
  const totalAnomalies = summaries.reduce((sum, s) => sum + s.anomaly_count, 0);
  const activeSources = summaries.filter(s => s.count > 0).length;
  const activeMetrics = new Set(summaries.map(s => s.metric)).size;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">实时监测面板</h1>
        <p className="text-gray-400">实时监控系统运行状态和关键指标</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="数据点总数"
          value={totalDataPoints}
          icon={<Database className="w-6 h-6" />}
          color="#06b6d4"
          trend={{ value: 12, isUp: true }}
          delay={0}
        />
        <StatsCard
          title="活跃指标"
          value={activeMetrics}
          icon={<Activity className="w-6 h-6" />}
          color="#10b981"
          delay={100}
        />
        <StatsCard
          title="在线数据源"
          value={`${activeSources}/${sources.length}`}
          icon={<Cpu className="w-6 h-6" />}
          color="#8b5cf6"
          trend={{ value: 0, isUp: false }}
          delay={200}
        />
        <StatsCard
          title="异常次数"
          value={totalAnomalies}
          icon={<AlertTriangle className="w-6 h-6" />}
          color="#ef4444"
          trend={{ value: 8, isUp: true }}
          delay={300}
        />
      </div>

      <FilterBar showAggregation={false} showOnlyAnomalies={false} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric, idx) => {
          const summary = summaries.find(
            (s) => s.metric === metric.name
          );
          return (
            <MetricCard
              key={metric.name}
              metric={metric}
              summary={summary}
              delay={idx * 100}
            />
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-accent-cyan" />
                <h2 className="font-medium">实时数据流</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" />
                <span className="text-xs text-gray-400">实时更新中</span>
              </div>
            </div>
            <div className="h-64 overflow-auto space-y-2">
              {summaries.slice(0, 10).map((s, idx) => (
                <div
                  key={`${s.metric}-${s.source}-${idx}`}
                  className="flex items-center justify-between px-3 py-2 rounded-lg bg-bg-tertiary/30 hover:bg-bg-tertiary/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 font-number">
                      {new Date(s.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-sm text-gray-300">
                      {metrics.find(m => m.name === s.metric)?.display_name || s.metric}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({sources.find(src => src.name === s.source)?.display_name || s.source})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono font-number ${
                        s.anomaly_count > 0 ? 'text-status-error' : 'text-accent-cyan'
                      }`}
                    >
                      {s.value.toFixed(2)}
                    </span>
                    {s.anomaly_count > 0 && (
                      <AlertTriangle className="w-3 h-3 text-status-error" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-status-warning" />
                <h2 className="font-medium">最近告警</h2>
              </div>
              <span className="text-xs text-gray-500">{recentAlerts.length} 条</span>
            </div>
            <div className="space-y-3 max-h-96 overflow-auto">
              {recentAlerts.length > 0 ? (
                recentAlerts.slice(0, 5).map((alert, idx) => (
                  <AlertItem key={alert.id} alert={alert} isNew={idx === 0} />
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 opacity-30" />
                  <p>暂无告警信息</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

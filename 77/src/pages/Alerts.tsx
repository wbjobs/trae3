import { useEffect, useState, useCallback } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useMonitorStore } from '@/store/useMonitorStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { api } from '@/services/api';
import FilterBar from '@/components/FilterBar';
import AlertItem from '@/components/AlertItem';
import AlertStatsChart from '@/components/AlertStatsChart';
import type { AlertEvent, AlertStats } from '@/types';

export default function Alerts() {
  const { filters, recentAlerts, setAlerts, addAlert, setWsConnected } = useMonitorStore();
  const [alertStats, setAlertStats] = useState<AlertStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [alerts, stats] = await Promise.all([
        api.getAlerts({
          startTime: filters.startTime,
          endTime: filters.endTime,
          level: filterLevel === 'all' ? undefined : filterLevel,
          limit: 100,
        }),
        api.getAlertStats({
          startTime: filters.startTime,
          endTime: filters.endTime,
        }),
      ]);
      setAlerts(alerts);
      setAlertStats(stats);
    } catch (error) {
      console.error('Failed to load alerts:', error);
    } finally {
      setLoading(false);
    }
  }, [filters, filterLevel, setAlerts]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useWebSocket({
    onAlert: (alert: AlertEvent) => {
      addAlert(alert);
      loadData();
    },
    onOpen: () => setWsConnected(true),
    onClose: () => setWsConnected(false),
  });

  const filteredAlerts = filterLevel === 'all'
    ? recentAlerts
    : recentAlerts.filter(a => a.level === filterLevel);

  const levelFilters = [
    { value: 'all', label: '全部', count: recentAlerts.length },
    { value: 'critical', label: '严重', count: recentAlerts.filter(a => a.level === 'critical').length, color: 'text-status-error' },
    { value: 'warning', label: '警告', count: recentAlerts.filter(a => a.level === 'warning').length, color: 'text-status-warning' },
    { value: 'info', label: '信息', count: recentAlerts.filter(a => a.level === 'info').length, color: 'text-status-info' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">异常告警</h1>
          <p className="text-gray-400">异常事件列表和告警统计分析</p>
        </div>
        <button
          onClick={loadData}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50 hover:bg-accent-cyan/30 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {alertStats && <AlertStatsChart stats={alertStats} />}

      <FilterBar showAggregation={false} showOnlyAnomalies={false} />

      <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-status-warning" />
            <h2 className="font-medium">告警列表</h2>
            <span className="text-xs text-gray-500">({filteredAlerts.length} 条)</span>
          </div>

          <div className="flex gap-2">
            {levelFilters.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterLevel(f.value)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  filterLevel === f.value
                    ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50'
                    : 'bg-bg-tertiary/50 text-gray-400 border border-transparent hover:bg-bg-tertiary'
                }`}
              >
                <span className={filterLevel === f.value ? '' : f.color}>
                  {f.label} ({f.count})
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && filteredAlerts.length > 0 && (
          <div className="space-y-3 max-h-[600px] overflow-auto">
            {filteredAlerts.map((alert, idx) => (
              <AlertItem key={alert.id} alert={alert} isNew={idx === 0} />
            ))}
          </div>
        )}

        {!loading && filteredAlerts.length === 0 && (
          <div className="text-center py-16 text-gray-500">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4 opacity-30" />
            <p className="text-lg">暂无告警信息</p>
            <p className="text-sm mt-1">系统运行正常，未检测到异常</p>
          </div>
        )}
      </div>
    </div>
  );
}

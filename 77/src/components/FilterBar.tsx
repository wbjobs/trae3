import { useMonitorStore } from '@/store/useMonitorStore';
import { TIME_RANGES } from '@/utils/time';
import type { TimeRangeKey } from '@/types';
import { Filter, Calendar, Database, Activity, AlertTriangle } from 'lucide-react';

interface FilterBarProps {
  showAggregation?: boolean;
  showOnlyAnomalies?: boolean;
}

export default function FilterBar({
  showAggregation = true,
  showOnlyAnomalies = true,
}: FilterBarProps) {
  const {
    filters,
    metrics,
    sources,
    setTimeRange,
    toggleMetric,
    toggleSource,
    setAggregation,
    setOnlyAnomalies,
  } = useMonitorStore();

  const aggregations = [
    { value: 'raw', label: '原始' },
    { value: '1m', label: '1分钟' },
    { value: '5m', label: '5分钟' },
    { value: '15m', label: '15分钟' },
    { value: '1h', label: '1小时' },
  ] as const;

  return (
    <div className="bg-bg-secondary/60 backdrop-blur-sm rounded-xl border border-border-glow p-4 mb-6">
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-5 h-5 text-accent-cyan" />
        <span className="font-medium">数据筛选</span>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">时间范围:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(TIME_RANGES).map(([key, { label }]) => (
              <button
                key={key}
                onClick={() => setTimeRange(key as TimeRangeKey)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  filters.timeRange === key
                    ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50'
                    : 'bg-bg-tertiary/50 text-gray-400 border border-transparent hover:bg-bg-tertiary hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">指标:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {metrics.map((m) => (
              <button
                key={m.name}
                onClick={() => toggleMetric(m.name)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  filters.selectedMetrics.includes(m.name) || filters.selectedMetrics.length === 0
                    ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50'
                    : 'bg-bg-tertiary/50 text-gray-500 border border-transparent hover:bg-bg-tertiary hover:text-gray-300'
                }`}
              >
                {m.display_name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-400">数据源:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {sources.map((s) => (
              <button
                key={s.name}
                onClick={() => toggleSource(s.name)}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  filters.selectedSources.includes(s.name) || filters.selectedSources.length === 0
                    ? 'bg-status-success/20 text-status-success border border-status-success/50'
                    : 'bg-bg-tertiary/50 text-gray-500 border border-transparent hover:bg-bg-tertiary hover:text-gray-300'
                }`}
              >
                {s.display_name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-6 flex-wrap">
          {showAggregation && (
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">聚合粒度:</span>
              <div className="flex gap-2">
                {aggregations.map((agg) => (
                  <button
                    key={agg.value}
                    onClick={() => setAggregation(agg.value)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                      filters.aggregation === agg.value
                        ? 'bg-accent-cyan/20 text-accent-cyan border border-accent-cyan/50'
                        : 'bg-bg-tertiary/50 text-gray-400 border border-transparent hover:bg-bg-tertiary'
                    }`}
                  >
                    {agg.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {showOnlyAnomalies && (
            <label className="flex items-center gap-2 cursor-pointer">
              <AlertTriangle className="w-4 h-4 text-status-warning" />
              <span className="text-sm text-gray-400">仅显示异常</span>
              <div
                className={`w-10 h-5 rounded-full transition-all relative ${
                  filters.onlyAnomalies ? 'bg-status-warning' : 'bg-bg-tertiary'
                }`}
                onClick={() => setOnlyAnomalies(!filters.onlyAnomalies)}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all ${
                    filters.onlyAnomalies ? 'left-5' : 'left-0.5'
                  }`}
                />
              </div>
            </label>
          )}
        </div>
      </div>
    </div>
  );
}

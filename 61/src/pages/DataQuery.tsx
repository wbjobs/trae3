import { useEffect, useState } from 'react';
import { useSensorStore } from '@/stores/sensor-store';
import { Search, Download } from 'lucide-react';
import type { SensorData } from '../../shared/types';

type TimeRange = '1h' | '6h' | '24h' | '7d' | 'custom';

const timeRangeOptions: { value: TimeRange; label: string }[] = [
  { value: '1h', label: '最近1小时' },
  { value: '6h', label: '最近6小时' },
  { value: '24h', label: '最近24小时' },
  { value: '7d', label: '最近7天' },
  { value: 'custom', label: '自定义' },
];

function getTimeRangeMs(range: TimeRange, customStart?: string, customEnd?: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString();
  let start: Date;
  switch (range) {
    case '1h': start = new Date(now.getTime() - 3600000); break;
    case '6h': start = new Date(now.getTime() - 21600000); break;
    case '24h': start = new Date(now.getTime() - 86400000); break;
    case '7d': start = new Date(now.getTime() - 604800000); break;
    case 'custom':
      start = customStart ? new Date(customStart) : new Date(now.getTime() - 3600000);
      const endCustom = customEnd ? new Date(customEnd) : now;
      return { start: start.toISOString(), end: endCustom.toISOString() };
    default: start = new Date(now.getTime() - 3600000);
  }
  return { start: start.toISOString(), end };
}

export default function DataQuery() {
  const { sensors, fetchSensors } = useSensorStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [range, setRange] = useState<TimeRange>('1h');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [results, setResults] = useState<SensorData[]>([]);
  const [loading, setLoading] = useState(false);
  const [retentionDays, setRetentionDays] = useState(30);
  const [autoCleanup, setAutoCleanup] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    fetchSensors();
  }, [fetchSensors]);

  const toggleSensor = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleQuery = async () => {
    if (selectedIds.length === 0) return;
    setLoading(true);
    try {
      const { start, end } = getTimeRangeMs(range, customStart, customEnd);
      const params = new URLSearchParams({
        sensorIds: selectedIds.join(','),
        startTime: start,
        endTime: end,
      });
      const res = await fetch(`/api/data/query?${params}`);
      if (res.ok) {
        const result = await res.json();
        setResults(result.data || []);
      }
    } catch {}
    setLoading(false);
  };

  const handleExport = (format: 'csv' | 'json') => {
    if (results.length === 0) return;
    if (format === 'json') {
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'data.json';
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const header = 'id,sensorId,value,quality,timestamp';
      const rows = results.map((r) => `${r.id},${r.sensorId},${r.value},${r.quality},${r.timestamp}`);
      const csv = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'data.csv';
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white hover:border-accent focus:outline-none"
          >
            <Search size={14} className="text-status-offline" />
            选择传感器 ({selectedIds.length})
          </button>
          {dropdownOpen && (
            <div className="absolute top-10 left-0 z-10 w-56 max-h-60 overflow-auto rounded border border-dark-border bg-dark-card shadow-lg">
              {sensors.map((s) => (
                <label key={s.id} className="flex items-center gap-2 px-3 py-2 hover:bg-dark-border/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(s.id)}
                    onChange={() => toggleSensor(s.id)}
                    className="accent-accent"
                  />
                  <span className="text-xs text-white truncate">{s.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <select
          value={range}
          onChange={(e) => setRange(e.target.value as TimeRange)}
          className="h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
        >
          {timeRangeOptions.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        {range === 'custom' && (
          <>
            <input
              type="datetime-local"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
            />
            <input
              type="datetime-local"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="h-9 px-3 rounded border border-dark-border bg-dark-bg text-sm text-white focus:outline-none focus:border-accent"
            />
          </>
        )}

        <button
          onClick={handleQuery}
          disabled={selectedIds.length === 0 || loading}
          className="h-9 px-6 rounded bg-accent text-dark-bg text-sm font-medium hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          查询
        </button>

        <div className="flex-1" />

        <button
          onClick={() => handleExport('csv')}
          disabled={results.length === 0}
          className="flex items-center gap-1 h-9 px-3 rounded border border-dark-border text-xs text-status-offline hover:text-accent hover:border-accent disabled:opacity-50"
        >
          <Download size={12} /> CSV
        </button>
        <button
          onClick={() => handleExport('json')}
          disabled={results.length === 0}
          className="flex items-center gap-1 h-9 px-3 rounded border border-dark-border text-xs text-status-offline hover:text-accent hover:border-accent disabled:opacity-50"
        >
          <Download size={12} /> JSON
        </button>
      </div>

      <div className="rounded border border-dark-border bg-dark-card overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-border text-left text-status-offline">
              <th className="px-4 py-3 font-normal">ID</th>
              <th className="px-4 py-3 font-normal">传感器ID</th>
              <th className="px-4 py-3 font-normal">值</th>
              <th className="px-4 py-3 font-normal">质量</th>
              <th className="px-4 py-3 font-normal">时间戳</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} className="border-b border-dark-border hover:bg-dark-border/20">
                <td className="px-4 py-3 font-mono text-white">{r.id}</td>
                <td className="px-4 py-3 text-white">{r.sensorId}</td>
                <td className="px-4 py-3 font-mono text-accent">{r.value}</td>
                <td className="px-4 py-3">
                  <span className={
                    r.quality === 'good' ? 'text-status-online' :
                    r.quality === 'bad' ? 'text-status-alarm' : 'text-status-warning'
                  }>
                    {r.quality}
                  </span>
                </td>
                <td className="px-4 py-3 text-status-offline">{new Date(r.timestamp).toLocaleString()}</td>
              </tr>
            ))}
            {results.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-status-offline">
                  {loading ? '查询中...' : '选择传感器并点击查询'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded border border-dark-border bg-dark-card p-4">
        <div className="text-xs font-mono text-status-offline mb-3">存储策略配置</div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <label className="text-xs text-status-offline">保留天数</label>
            <input
              type="number"
              value={retentionDays}
              onChange={(e) => setRetentionDays(Number(e.target.value))}
              className="w-20 h-7 px-2 rounded border border-dark-border bg-dark-bg text-xs text-white focus:outline-none focus:border-accent"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-status-offline">自动清理</label>
            <button
              onClick={() => setAutoCleanup(!autoCleanup)}
              className={`w-10 h-5 rounded-full transition-colors ${autoCleanup ? 'bg-accent' : 'bg-dark-border'}`}
            >
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${autoCleanup ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

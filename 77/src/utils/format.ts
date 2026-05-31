export function formatNumber(value: number, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return value.toFixed(decimals);
}

export function formatPercent(value: number, decimals: number = 1): string {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return `${value.toFixed(decimals)}%`;
}

export function getTrendDirection(current: number, previous: number): 'up' | 'down' | 'stable' {
  if (previous === 0) return 'stable';
  const diff = current - previous;
  const ratio = Math.abs(diff / previous);
  if (ratio < 0.01) return 'stable';
  return diff > 0 ? 'up' : 'down';
}

export function getLevelColor(level: string): string {
  switch (level) {
    case 'critical':
      return 'text-status-error';
    case 'warning':
      return 'text-status-warning';
    case 'info':
      return 'text-status-info';
    default:
      return 'text-gray-400';
  }
}

export function getLevelBgColor(level: string): string {
  switch (level) {
    case 'critical':
      return 'bg-status-error/20 border-status-error/50';
    case 'warning':
      return 'bg-status-warning/20 border-status-warning/50';
    case 'info':
      return 'bg-status-info/20 border-status-info/50';
    default:
      return 'bg-gray-700/20 border-gray-600/50';
  }
}

export function getValueStatus(value: number, warn?: number, crit?: number): 'normal' | 'warning' | 'critical' {
  if (crit !== undefined && value >= crit) return 'critical';
  if (warn !== undefined && value >= warn) return 'warning';
  return 'normal';
}

export function getStatusColor(status: string): string {
  switch (status) {
    case 'critical':
      return 'text-status-error';
    case 'warning':
      return 'text-status-warning';
    case 'normal':
    case 'success':
      return 'text-status-success';
    default:
      return 'text-gray-400';
  }
}

export const metricColorMap: Record<string, string> = {
  cpu_usage: '#06b6d4',
  memory_usage: '#8b5cf6',
  disk_io: '#f59e0b',
  network_latency: '#10b981',
  temperature: '#ef4444',
  error_rate: '#ec4899',
};

export function getMetricColor(metric: string): string {
  return metricColorMap[metric] || '#64748b';
}

export function abbreviateNumber(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(1);
}

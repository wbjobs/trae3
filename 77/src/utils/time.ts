import type { TimeRangeKey } from '@/types';

export const TIME_RANGES: Record<TimeRangeKey, { label: string; ms: number }> = {
  '5m': { label: '5分钟', ms: 5 * 60 * 1000 },
  '15m': { label: '15分钟', ms: 15 * 60 * 1000 },
  '1h': { label: '1小时', ms: 60 * 60 * 1000 },
  '6h': { label: '6小时', ms: 6 * 60 * 60 * 1000 },
  '24h': { label: '24小时', ms: 24 * 60 * 60 * 1000 },
  '7d': { label: '7天', ms: 7 * 24 * 60 * 60 * 1000 },
};

export function getTimeRangeMs(key: TimeRangeKey): number {
  return TIME_RANGES[key]?.ms || TIME_RANGES['1h'].ms;
}

export function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
}

export function formatDateTime(timestamp: number): string {
  const date = new Date(timestamp);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${month}-${day} ${hours}:${minutes}`;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}天前`;
  if (hours > 0) return `${hours}小时前`;
  if (minutes > 0) return `${minutes}分钟前`;
  if (seconds > 0) return `${seconds}秒前`;
  return '刚刚';
}

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

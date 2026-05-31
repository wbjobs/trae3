import { AlertCircle, AlertTriangle, Info, XCircle, CheckCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert } from '../../shared/types';
import { AlertLevelBadge } from './StatusBadge';

interface AlertItemProps {
  alert: Alert;
  onResolve?: (alertId: string) => void;
  onDismiss?: (alertId: string) => void;
  showActions?: boolean;
  className?: string;
}

const levelConfig = {
  info: {
    icon: Info,
    border: 'border-l-blue-500',
    bg: 'bg-blue-900/10',
    hover: 'hover:bg-blue-900/20',
    iconColor: 'text-blue-400',
  },
  warning: {
    icon: AlertTriangle,
    border: 'border-l-yellow-500',
    bg: 'bg-yellow-900/10',
    hover: 'hover:bg-yellow-900/20',
    iconColor: 'text-yellow-400',
  },
  error: {
    icon: AlertCircle,
    border: 'border-l-red-500',
    bg: 'bg-red-900/10',
    hover: 'hover:bg-red-900/20',
    iconColor: 'text-red-400',
  },
  critical: {
    icon: XCircle,
    border: 'border-l-red-600',
    bg: 'bg-red-900/20',
    hover: 'hover:bg-red-900/30',
    iconColor: 'text-red-500',
  },
};

const typeLabels: Record<Alert['type'], string> = {
  node: '节点告警',
  task: '任务告警',
  system: '系统告警',
};

export default function AlertItem({
  alert,
  onResolve,
  onDismiss,
  showActions = true,
  className,
}: AlertItemProps) {
  const config = levelConfig[alert.level];
  const Icon = config.icon;

  const formatTime = (date: Date) => {
    const d = date instanceof Date ? date : new Date(date);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <div
      className={cn(
        'relative border-l-4 rounded-lg p-4 transition-all duration-200 group',
        config.border,
        config.bg,
        config.hover,
        alert.resolved && 'opacity-60',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn(
          'p-2 rounded-lg flex-shrink-0',
          alert.level === 'critical' ? 'bg-red-900/50' : 'bg-space-800/50'
        )}>
          <Icon className={cn(
            'w-5 h-5',
            config.iconColor,
            alert.level === 'critical' && !alert.resolved && 'animate-pulse'
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <AlertLevelBadge status={alert.level} showDot={!alert.resolved} />
              <span className="text-xs px-2 py-0.5 rounded bg-space-800/50 text-industrial-400">
                {typeLabels[alert.type]}
              </span>
              {alert.resolved && (
                <span className="text-xs px-2 py-0.5 rounded bg-green-900/30 text-green-400 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" />
                  已解决
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs text-industrial-500 flex-shrink-0">
              <Clock className="w-3 h-3" />
              <span>{formatTime(alert.timestamp)}</span>
            </div>
          </div>

          <p className={cn(
            'text-sm leading-relaxed',
            alert.resolved ? 'text-industrial-500 line-through' : 'text-industrial-200'
          )}>
            {alert.message}
          </p>

          {showActions && !alert.resolved && (
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => onResolve?.(alert.id)}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-900/30 text-green-400 hover:bg-green-900/50 transition-colors"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                标记已解决
              </button>
              {onDismiss && (
                <button
                  onClick={() => onDismiss(alert.id)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-space-800/50 text-industrial-400 hover:bg-space-700/50 transition-colors"
                >
                  忽略
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {alert.level === 'critical' && !alert.resolved && (
        <div className="absolute inset-0 rounded-lg border border-red-500/30 animate-pulse pointer-events-none" />
      )}
    </div>
  );
}

interface AlertListProps {
  alerts: Alert[];
  onResolve?: (alertId: string) => void;
  onDismiss?: (alertId: string) => void;
  showActions?: boolean;
  maxItems?: number;
  className?: string;
}

export function AlertList({
  alerts,
  onResolve,
  onDismiss,
  showActions,
  maxItems,
  className,
}: AlertListProps) {
  const displayAlerts = maxItems ? alerts.slice(0, maxItems) : alerts;

  const sortedAlerts = [...displayAlerts].sort((a, b) => {
    const levelPriority = { critical: 0, error: 1, warning: 2, info: 3 };
    const priorityDiff = levelPriority[a.level] - levelPriority[b.level];
    if (priorityDiff !== 0) return priorityDiff;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });

  if (sortedAlerts.length === 0) {
    return (
      <div className={cn('text-center py-8 text-industrial-500', className)}>
        <CheckCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>暂无告警</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {sortedAlerts.map((alert) => (
        <AlertItem
          key={alert.id}
          alert={alert}
          onResolve={onResolve}
          onDismiss={onDismiss}
          showActions={showActions}
        />
      ))}
    </div>
  );
}

interface AlertSummaryProps {
  alerts: Alert[];
  className?: string;
}

export function AlertSummary({ alerts, className }: AlertSummaryProps) {
  const counts = {
    critical: alerts.filter((a) => a.level === 'critical' && !a.resolved).length,
    error: alerts.filter((a) => a.level === 'error' && !a.resolved).length,
    warning: alerts.filter((a) => a.level === 'warning' && !a.resolved).length,
    info: alerts.filter((a) => a.level === 'info' && !a.resolved).length,
  };

  const items = [
    { label: '严重', count: counts.critical, color: 'text-red-500', bg: 'bg-red-900/30' },
    { label: '错误', count: counts.error, color: 'text-red-400', bg: 'bg-red-900/20' },
    { label: '警告', count: counts.warning, color: 'text-yellow-400', bg: 'bg-yellow-900/20' },
    { label: '信息', count: counts.info, color: 'text-blue-400', bg: 'bg-blue-900/20' },
  ];

  return (
    <div className={cn('grid grid-cols-4 gap-2', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            'text-center p-3 rounded-lg transition-all hover:scale-105',
            item.bg,
            item.count > 0 && 'animate-pulse'
          )}
        >
          <p className={cn('text-2xl font-bold', item.color)}>{item.count}</p>
          <p className="text-xs text-industrial-400 mt-1">{item.label}</p>
        </div>
      ))}
    </div>
  );
}

export type { AlertItemProps, AlertListProps, AlertSummaryProps };

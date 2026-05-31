import { useState } from 'react';
import { AlertTriangle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import type { AlertEvent } from '@/types';
import { formatDateTime, formatRelativeTime } from '@/utils/time';
import { getLevelColor, getLevelBgColor, formatNumber } from '@/utils/format';

interface AlertItemProps {
  alert: AlertEvent;
  isNew?: boolean;
}

export default function AlertItem({ alert, isNew = false }: AlertItemProps) {
  const [expanded, setExpanded] = useState(false);

  const iconMap = {
    critical: AlertTriangle,
    warning: AlertCircle,
    info: Info,
  };

  const Icon = iconMap[alert.level] || Info;

  return (
    <div
      className={`rounded-lg border transition-all ${getLevelBgColor(alert.level)} ${
        isNew ? 'animate-slide-in' : ''
      }`}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className={`p-2 rounded-lg bg-black/20 ${getLevelColor(alert.level)}`}>
          <Icon className="w-5 h-5" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`font-medium ${getLevelColor(alert.level)}`}>
              {alert.level === 'critical' ? '严重' : alert.level === 'warning' ? '警告' : '信息'}
            </span>
            <span className="text-xs text-gray-500">
              {alert.alert_type}
            </span>
            {isNew && (
              <span className="px-2 py-0.5 rounded-full bg-status-error/30 text-status-error text-xs animate-pulse">
                新告警
              </span>
            )}
          </div>
          <div className="text-sm text-gray-300 mt-0.5 truncate">
            {alert.description}
          </div>
        </div>

        <div className="text-right">
          <div className="font-mono font-number text-lg">
            {formatNumber(alert.value)}
          </div>
          <div className="text-xs text-gray-500">
            {formatRelativeTime(alert.timestamp)}
          </div>
        </div>

        <div className="text-gray-500">
          {expanded ? (
            <ChevronUp className="w-5 h-5" />
          ) : (
            <ChevronDown className="w-5 h-5" />
          )}
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-4 pt-0 border-t border-white/10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
            <div>
              <div className="text-gray-500">指标</div>
              <div className="font-medium">{alert.metric}</div>
            </div>
            <div>
              <div className="text-gray-500">数据源</div>
              <div className="font-medium">{alert.source}</div>
            </div>
            <div>
              <div className="text-gray-500">阈值</div>
              <div className="font-medium font-number">{formatNumber(alert.threshold)}</div>
            </div>
            <div>
              <div className="text-gray-500">发生时间</div>
              <div className="font-medium">{formatDateTime(alert.timestamp)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { AlertTriangle } from 'lucide-react';
import { SEVERITY_LABELS, FAULT_TYPE_LABELS, type FaultType } from '../../../shared/types';
import type { DashboardStats } from '../../../shared/types';

interface Props {
  stats: DashboardStats;
}

export default function CriticalAlerts({ stats }: Props) {
  return (
    <div className="bg-dark-800 rounded-xl p-5 border border-dark-700">
      <h3 className="text-lg font-semibold mb-4">高危预警</h3>
      <div className="space-y-2">
        {stats.recentCritical.map((alert) => (
          <div
            key={alert.id}
            className="flex items-center gap-3 p-3 bg-dark-700/50 rounded-lg animate-pulse-alert border border-thermal-red/30"
          >
            <AlertTriangle className="w-5 h-5 text-thermal-red shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{alert.filename}</p>
              <p className="text-xs text-neutral-400">
                {FAULT_TYPE_LABELS[alert.faultType as FaultType] || alert.faultType} · {SEVERITY_LABELS[alert.severity as keyof typeof SEVERITY_LABELS] || alert.severity}
              </p>
            </div>
            <span className="text-xs text-neutral-500 shrink-0">{alert.createdAt.slice(0, 16)}</span>
          </div>
        ))}
        {stats.recentCritical.length === 0 && (
          <p className="text-neutral-500 text-sm text-center py-4">暂无高危预警</p>
        )}
      </div>
    </div>
  );
}

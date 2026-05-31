import { useMonitorStore } from '../store/monitorStore';

const severityColors: Record<number, string> = {
  1: 'bg-blue-900/30 border-blue-500/50',
  2: 'bg-amber-900/30 border-amber-500/50',
  3: 'bg-rose-900/30 border-rose-500/50',
};

const severityBadgeColors: Record<number, string> = {
  1: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  2: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  3: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
};

export function AlertList() {
  const { alerts, resolveAlert, escalateAlert } = useMonitorStore();
  const unresolved = alerts.filter(a => !a.resolved).slice(0, 10);

  const formatTime = (time: string | undefined) => {
    if (!time) return '';
    return new Date(time).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-slate-100 mb-4 flex items-center gap-2">
        <span>🔔</span>
        告警中心
        <span className="text-xs font-normal text-slate-400">
          ({unresolved.length} 未处理)
        </span>
      </h3>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {unresolved.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <div className="text-4xl mb-2">✨</div>
            <p>暂无告警</p>
          </div>
        ) : (
          unresolved.map(alert => (
            <div
              key={alert.id}
              className={`p-3 rounded-lg border ${severityColors[alert.severity] || severityColors[1]}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 text-xs rounded border ${severityBadgeColors[alert.severity] || severityBadgeColors[1]}`}>
                      P{alert.severity}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      alert.alert_level === 'critical'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {alert.alert_level}
                    </span>
                    {alert.escalation_count > 0 && (
                      <span className="text-xs text-rose-400">
                        升级 ×{alert.escalation_count}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-200 font-medium truncate">
                    {alert.message}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {alert.node_id} · {formatTime(alert.created_at)}
                  </p>
                </div>
                <div className="flex flex-col gap-1">
                  <button
                    onClick={() => resolveAlert(alert.id)}
                    className="px-2 py-1 text-xs rounded bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >
                    处理
                  </button>
                  {alert.severity < 3 && (
                    <button
                      onClick={() => escalateAlert(alert.id)}
                      className="px-2 py-1 text-xs rounded bg-rose-600 hover:bg-rose-500 text-white transition-colors"
                    >
                      升级
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

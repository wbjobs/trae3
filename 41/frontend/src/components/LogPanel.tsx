import { ScrollText, Info, AlertTriangle, XCircle, Bug } from 'lucide-react';
import { useMonitorStore } from '../store/monitorStore';

export function LogPanel() {
  const { logs } = useMonitorStore();

  const levelConfig = {
    info: { icon: Info, color: '#00d4ff' },
    warning: { icon: AlertTriangle, color: '#f59e0b' },
    error: { icon: XCircle, color: '#ff4757' },
    debug: { icon: Bug, color: '#a4b0be' },
  };

  return (
    <div className="overflow-hidden rounded-xl bg-slate-800/50 backdrop-blur">
      <div className="border-b border-slate-700/50 px-6 py-4">
        <div className="flex items-center gap-2">
          <ScrollText size={18} className="text-slate-400" />
          <h3 className="text-lg font-semibold text-white">系统日志</h3>
        </div>
      </div>
      <div className="max-h-64 overflow-auto font-mono text-xs">
        {logs.length === 0 ? (
          <div className="px-6 py-8 text-center text-slate-500">暂无日志</div>
        ) : (
          <div className="divide-y divide-slate-700/30">
            {logs.slice(0, 50).map((log, idx) => {
              const config = levelConfig[log.level] || levelConfig.info;
              const Icon = config.icon;
              const time = new Date(log.timestamp).toLocaleTimeString('zh-CN');
              return (
                <div key={idx} className="flex items-start gap-3 px-6 py-2 hover:bg-slate-700/20">
                  <span className="text-slate-500 shrink-0">{time}</span>
                  <Icon size={12} style={{ color: config.color, flexShrink: 0, marginTop: 2 }} />
                  <span className="text-slate-400 shrink-0">[{log.node_id}]</span>
                  <span className="text-slate-300 truncate">{log.message}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

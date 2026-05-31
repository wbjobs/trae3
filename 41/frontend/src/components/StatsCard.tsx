import { useMonitorStore } from '../store/monitorStore';

const StatCard = ({ title, value, colorClass, subtitle, icon }: {
  title: string;
  value: number;
  colorClass: string;
  subtitle?: string;
  icon: string;
}) => (
  <div className={`rounded-lg p-6 bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all duration-200`}>
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium text-slate-400">{title}</p>
        <p className={`text-3xl font-bold mt-1 ${colorClass}`}>
          {value}
        </p>
        {subtitle && <p className="text-xs text-slate-500 mt-1">{subtitle}</p>}
      </div>
      <div className={`text-3xl ${colorClass} opacity-50`}>{icon}</div>
    </div>
  </div>
);

export function StatsCards() {
  const { stats } = useMonitorStore();

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="总节点数"
        value={stats.total}
        colorClass="text-blue-400"
        subtitle={`P1: ${stats.p1_count} | P2: ${stats.p2_count} | P3: ${stats.p3_count}`}
        icon="🖥️"
      />
      <StatCard
        title="在线节点"
        value={stats.online}
        colorClass="text-emerald-400"
        subtitle={`占比 ${stats.total ? Math.round((stats.online / stats.total) * 100) : 0}%`}
        icon="✅"
      />
      <StatCard
        title="异常节点"
        value={stats.abnormal}
        colorClass="text-amber-400"
        subtitle={`高严重告警: ${stats.high_severity_alerts}`}
        icon="⚠️"
      />
      <StatCard
        title="离线节点"
        value={stats.offline}
        colorClass="text-rose-400"
        subtitle={`活跃告警: ${stats.active_alerts}`}
        icon="❌"
      />
    </div>
  );
}

import { FAULT_TYPE_LABELS } from '../../../shared/types';
import type { DashboardStats } from '../../../shared/types';

interface Props {
  stats: DashboardStats;
}

export default function FaultDistribution({ stats }: Props) {
  const maxCount = Math.max(...stats.faultDistribution.map(d => d.count), 1);

  return (
    <div className="bg-dark-800 rounded-xl p-5 border border-dark-700">
      <h3 className="text-lg font-semibold mb-4">故障类型分布</h3>
      <div className="space-y-3">
        {stats.faultDistribution.map((item) => (
          <div key={item.faultType} className="flex items-center gap-3">
            <span className="w-20 text-sm text-neutral-300 shrink-0">
              {FAULT_TYPE_LABELS[item.faultType as keyof typeof FAULT_TYPE_LABELS] || item.faultType}
            </span>
            <div className="flex-1 h-6 bg-dark-700 rounded overflow-hidden">
              <div
                className="h-full bg-thermal-gradient rounded transition-all"
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
            <span className="w-8 text-right text-sm font-mono text-neutral-300">{item.count}</span>
          </div>
        ))}
        {stats.faultDistribution.length === 0 && (
          <p className="text-neutral-500 text-sm text-center py-4">暂无数据</p>
        )}
      </div>
    </div>
  );
}

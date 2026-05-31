import { TrendingUp, AlertTriangle, Shield, FileText } from 'lucide-react';
import type { DashboardStats } from '../../../shared/types';

interface Props {
  stats: DashboardStats;
}

const cards = [
  { key: 'todayCount' as const, label: '今日检测数', icon: FileText, color: 'text-thermal-blue', bg: 'bg-thermal-blue/10' },
  { key: 'todayFaultRate' as const, label: '今日故障率', icon: TrendingUp, color: 'text-thermal-orange', bg: 'bg-thermal-orange/10', suffix: '%' },
  { key: 'criticalAlerts' as const, label: '高危预警', icon: AlertTriangle, color: 'text-thermal-red', bg: 'bg-thermal-red/10' },
  { key: 'totalCount' as const, label: '累计检测', icon: Shield, color: 'text-thermal-green', bg: 'bg-thermal-green/10' },
];

export default function StatsCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <div key={card.key} className="bg-dark-800 rounded-xl p-5 border border-dark-700 hover:border-dark-600 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <span className="text-neutral-400 text-sm">{card.label}</span>
            <div className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>
              <card.icon className={`w-4 h-4 ${card.color}`} />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono">{stats[card.key]}</span>
            {card.suffix && <span className="text-neutral-400">{card.suffix}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

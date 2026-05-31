import type { DashboardStats } from '../../../shared/types';

interface Props {
  stats: DashboardStats;
}

export default function TrendChart({ stats }: Props) {
  const maxTotal = Math.max(...stats.trend.map(d => d.total), 1);

  return (
    <div className="bg-dark-800 rounded-xl p-5 border border-dark-700">
      <h3 className="text-lg font-semibold mb-4">检测趋势（近7天）</h3>
      <div className="flex items-end gap-3" style={{ height: '160px' }}>
        {stats.trend.map((day, i) => {
          const totalH = (day.total / maxTotal) * 100;
          const faultH = maxTotal > 0 ? (day.faultCount / maxTotal) * 100 : 0;
          return (
            <div key={i} className="flex-1 flex flex-col items-center h-full">
              <div className="w-full flex-1 flex flex-col justify-end items-center gap-0.5">
                <div
                  className="w-full max-w-[32px] bg-thermal-blue/60 rounded-t transition-all"
                  style={{ height: `${totalH}%` }}
                />
                <div
                  className="w-full max-w-[32px] bg-thermal-gradient rounded-t transition-all"
                  style={{ height: `${faultH}%` }}
                />
              </div>
              <span className="text-xs text-neutral-400 mt-2 shrink-0">{day.date.slice(5)}</span>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 mt-3 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-thermal-blue/60" />
          <span className="text-xs text-neutral-400">总检测数</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-thermal-gradient" />
          <span className="text-xs text-neutral-400">故障数</span>
        </div>
      </div>
    </div>
  );
}

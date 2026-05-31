import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatsCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  trend?: number;
  color?: string;
}

export default function StatsCard({ icon, value, label, trend, color = 'text-accent' }: StatsCardProps) {
  return (
    <div className="rounded-xl bg-white p-5 shadow-sm transition-shadow hover:shadow-md animate-fadeIn">
      <div className="flex items-start justify-between">
        <div className={`rounded-lg bg-accent/10 p-2.5 ${color}`}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-sm ${trend >= 0 ? 'text-success' : 'text-red-500'}`}>
            {trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span>{Math.abs(trend)}%</span>
          </div>
        )}
      </div>
      <div className="mt-3">
        <p className="font-mono text-2xl font-bold text-[#1E3A5F]">{value}</p>
        <p className="mt-1 text-sm text-gray-500">{label}</p>
      </div>
    </div>
  );
}

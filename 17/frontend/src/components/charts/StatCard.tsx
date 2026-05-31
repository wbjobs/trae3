import { Card } from 'antd';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  unit?: string;
  trend?: number;
  icon?: React.ReactNode;
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

const colorGradients: Record<string, string> = {
  blue: 'from-blue-600 to-blue-400',
  green: 'from-emerald-600 to-emerald-400',
  yellow: 'from-amber-600 to-amber-400',
  red: 'from-red-600 to-red-400',
  purple: 'from-violet-600 to-violet-400',
};

export default function StatCard({
  title,
  value,
  unit,
  trend,
  icon,
  color = 'blue',
}: StatCardProps) {
  const getTrendIcon = () => {
    if (trend === undefined) return null;
    if (trend > 0) {
      return <TrendingUp className="w-4 h-4 text-emerald-400" />;
    } else if (trend < 0) {
      return <TrendingDown className="w-4 h-4 text-red-400" />;
    }
    return <Minus className="w-4 h-4 text-gray-400" />;
  };

  return (
    <Card
      className={`bg-gradient-to-br ${colorGradients[color]} border-0 overflow-hidden`}
      styles={{
        body: { padding: '20px' },
      }}
    >
      <div className="relative">
        <div className="absolute -right-4 -top-4 opacity-20">
          {icon && <div className="w-20 h-20">{icon}</div>}
        </div>
        <div className="relative z-10">
          <div className="text-white/80 text-sm mb-2">{title}</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-white">
              {typeof value === 'number' ? value.toLocaleString() : value}
            </span>
            {unit && <span className="text-white/70 text-lg">{unit}</span>}
          </div>
          {trend !== undefined && (
            <div className="flex items-center gap-1 mt-3">
              {getTrendIcon()}
              <span
                className={`text-sm ${
                  trend > 0
                    ? 'text-emerald-200'
                    : trend < 0
                    ? 'text-red-200'
                    : 'text-gray-300'
                }`}
              >
                {trend > 0 ? '+' : ''}
                {trend.toFixed(1)}% 较昨日
              </span>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

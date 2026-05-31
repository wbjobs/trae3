import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface MetricCardProps {
  icon: LucideIcon
  label: string
  value: number | string
  unit: string
  trend?: number
  sparkData?: number[]
  delay?: number
}

export default function MetricCard({
  icon: Icon,
  label,
  value,
  unit,
  trend,
  sparkData,
  delay = 0,
}: MetricCardProps) {
  const trendColor =
    trend === undefined || trend === 0
      ? 'text-gray-400'
      : trend > 0
        ? 'text-accent'
        : 'text-alert-orange'

  const TrendIcon =
    trend === undefined || trend === 0
      ? Minus
      : trend > 0
        ? TrendingUp
        : TrendingDown

  const maxVal = sparkData ? Math.max(...sparkData) : 1
  const minVal = sparkData ? Math.min(...sparkData) : 0
  const range = maxVal - minVal || 1

  return (
    <div
      className="card-hover p-5 animate-slide-up"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <Icon className="w-4 h-4 text-accent" />
          </div>
          <span className="text-sm text-gray-400">{label}</span>
        </div>
        {trend !== undefined && (
          <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
            <TrendIcon className="w-3.5 h-3.5" />
            <span className="font-mono">{Math.abs(trend).toFixed(1)}%</span>
          </div>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 mb-3">
        <span className="text-3xl font-mono font-bold text-white">{value}</span>
        <span className="text-sm text-gray-500">{unit}</span>
      </div>

      {sparkData && sparkData.length > 1 && (
        <div className="h-8 flex items-end gap-[2px]">
          {sparkData.map((v, i) => {
            const h = ((v - minVal) / range) * 100
            return (
              <div
                key={i}
                className="flex-1 bg-accent/30 rounded-sm transition-all duration-300 hover:bg-accent/50 min-w-[2px]"
                style={{ height: `${Math.max(h, 4)}%` }}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

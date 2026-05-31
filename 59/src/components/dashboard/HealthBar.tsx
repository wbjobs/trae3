import { cn } from '@/lib/utils'

interface HealthBarProps {
  deviceName: string
  healthScore: number
  status: 'online' | 'offline' | 'alarm'
}

export default function HealthBar({ deviceName, healthScore, status }: HealthBarProps) {
  const barColor = healthScore > 80 ? 'bg-green-ok' : healthScore >= 60 ? 'bg-amber-warn' : 'bg-red-alert'
  const textColor = healthScore > 80 ? 'text-green-ok' : healthScore >= 60 ? 'text-amber-warn' : 'text-red-alert'

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm text-slate-300 font-body w-28 truncate">{deviceName}</span>
      <div className="flex-1 h-2 bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', barColor)}
          style={{ width: `${healthScore}%` }}
        />
      </div>
      <span className={cn('text-sm font-display font-bold w-10 text-right', textColor)}>
        {healthScore}
      </span>
    </div>
  )
}

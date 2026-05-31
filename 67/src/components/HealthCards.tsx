import { useEffect, useRef } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitorStore'
import type { HealthSummary, NodeStatus } from '../../shared/types'

const statusColor: Record<NodeStatus, string> = {
  healthy: 'border-ops-accent text-ops-accent',
  warning: 'border-ops-warning text-ops-warning',
  critical: 'border-ops-critical text-ops-critical',
}

const statusGlow: Record<NodeStatus, string> = {
  healthy: 'shadow-[0_0_15px_rgba(6,214,160,0.15)]',
  warning: 'shadow-[0_0_15px_rgba(245,158,11,0.15)]',
  critical: 'shadow-[0_0_15px_rgba(239,68,68,0.15)]',
}

const metricLabel: Record<string, string> = {
  cpu: 'CPU Usage',
  memory: 'Memory',
  disk: 'Disk I/O',
  network: 'Network',
}

function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const prevRef = useRef(value)
  const spanRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (prevRef.current === value) return
    prevRef.current = value
    const el = spanRef.current
    if (!el) return
    el.classList.remove('animate-slide-up')
    void el.offsetWidth
    el.classList.add('animate-slide-up')
  }, [value])

  return (
    <span ref={spanRef} className={cn('font-mono font-bold inline-block', className)}>
      {value.toFixed(1)}%
    </span>
  )
}

function MiniSparkline({ status }: { status: NodeStatus }) {
  const color: Record<NodeStatus, string> = {
    healthy: '#06d6a0',
    warning: '#f59e0b',
    critical: '#ef4444',
  }
  const points = Array.from({ length: 20 }, () => 20 + Math.random() * 60)
  const w = 80
  const h = 28
  const step = w / (points.length - 1)
  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - p * 0.4).toFixed(1)}`)
    .join(' ')

  return (
    <svg width={w} height={h} className="opacity-60">
      <path d={pathD} fill="none" stroke={color[status]} strokeWidth="1.5" />
    </svg>
  )
}

function HealthCard({ item }: { item: HealthSummary }) {
  return (
    <div
      className={cn(
        'bg-ops-card rounded-xl border p-4 transition-all duration-300 animate-fade-in',
        statusColor[item.status],
        statusGlow[item.status]
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-ops-muted text-xs uppercase tracking-wider">
          {metricLabel[item.metricType] || item.metricType}
        </span>
        <span
          className={cn(
            'w-2 h-2 rounded-full',
            item.status === 'healthy' && 'bg-ops-accent',
            item.status === 'warning' && 'bg-ops-warning',
            item.status === 'critical' && 'bg-ops-critical'
          )}
        />
      </div>
      <div className="flex items-end justify-between">
        <div>
          <AnimatedNumber value={item.currentValue} className="text-2xl" />
          <div className="mt-1">
            {(() => {
              const Icon =
                item.trend === 'up'
                  ? TrendingUp
                  : item.trend === 'down'
                    ? TrendingDown
                    : Minus
              const color =
                item.trend === 'up'
                  ? 'text-ops-critical'
                  : item.trend === 'down'
                    ? 'text-ops-accent'
                    : 'text-ops-muted'
              return (
                <span className={cn('flex items-center gap-0.5 text-xs', color)}>
                  <Icon className="w-3 h-3" />
                  <span className="font-mono">
                    {item.trendPercent > 0 ? '+' : ''}
                    {item.trendPercent.toFixed(1)}%
                  </span>
                </span>
              )
            })()}
          </div>
        </div>
        <MiniSparkline status={item.status} />
      </div>
    </div>
  )
}

export default function HealthCards() {
  const healthSummary = useMonitorStore((s) => s.healthSummary)

  return (
    <div className="grid grid-cols-4 gap-4">
      {healthSummary.map((h) => (
        <HealthCard key={h.metricType} item={h} />
      ))}
    </div>
  )
}

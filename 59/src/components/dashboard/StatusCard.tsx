import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

interface StatusCardProps {
  title: string
  value: number
  icon: LucideIcon
  color: 'green-ok' | 'slate' | 'red-alert'
  subtitle?: string
}

export default function StatusCard({ title, value, icon: Icon, color, subtitle }: StatusCardProps) {
  const isAlarm = color === 'red-alert'

  return (
    <div
      className={cn(
        'glass-panel p-5 flex flex-col items-center justify-center gap-2 transition-all duration-300',
        'hover:border-neon-cyan/30 hover:shadow-[0_0_12px_rgba(0,240,255,0.15)]',
        isAlarm && 'animate-pulse-glow'
      )}
    >
      <Icon
        className={cn('w-8 h-8', {
          'text-green-ok': color === 'green-ok',
          'text-slate-400': color === 'slate',
          'text-red-alert': color === 'red-alert',
        })}
      />
      <span
        className={cn('font-display text-4xl font-bold', {
          'text-green-ok': color === 'green-ok',
          'text-slate-400': color === 'slate',
          'text-red-alert': color === 'red-alert',
        })}
      >
        {value}
      </span>
      <span className="text-sm text-slate-400 font-body">{title}</span>
      {subtitle && <span className="text-xs text-slate-500 font-body">{subtitle}</span>}
    </div>
  )
}

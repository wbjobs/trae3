interface ParamItemProps {
  label: string
  value: number | string
  unit: string
  highlight?: boolean
}

export function ParamItem({ label, value, unit, highlight }: ParamItemProps) {
  return (
    <div className="py-2">
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-mono font-semibold ${highlight ? 'animate-highlight' : ''}`}>
          {typeof value === 'number' ? value.toFixed(1) : value}
        </span>
        <span className="text-xs text-slate-500">{unit}</span>
      </div>
    </div>
  )
}

interface ParamCardProps {
  title: string
  children: React.ReactNode
}

export function ParamCard({ title, children }: ParamCardProps) {
  return (
    <div className="bg-inv-card border border-inv-border rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-3 pb-2 border-b border-inv-border">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1">{children}</div>
    </div>
  )
}

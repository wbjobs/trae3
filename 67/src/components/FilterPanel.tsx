import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Cpu, HardDrive, MemoryStick, Network } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitorStore'
import type { MetricType } from '../../shared/types'

const timeRanges = ['1h', '6h', '24h', '7d']
const metricOptions: { type: MetricType; label: string; icon: typeof Cpu }[] = [
  { type: 'cpu', label: 'CPU', icon: Cpu },
  { type: 'memory', label: 'Memory', icon: MemoryStick },
  { type: 'disk', label: 'Disk', icon: HardDrive },
  { type: 'network', label: 'Network', icon: Network },
]

function MultiSelectDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (val: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-ops-card border border-ops-border rounded-lg text-ops-text text-sm hover:border-ops-accent/50 transition-colors"
      >
        <span>{label}</span>
        <span className="text-ops-accent font-mono text-xs">({selected.length})</span>
        <ChevronDown className="w-3.5 h-3.5 text-ops-muted" />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 bg-ops-card border border-ops-border rounded-lg shadow-xl z-50 min-w-[160px] py-1 animate-fade-in">
          {options.map((opt) => (
            <label
              key={opt}
              className="flex items-center gap-2 px-3 py-1.5 hover:bg-ops-border/30 cursor-pointer text-sm text-ops-text"
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => onToggle(opt)}
                className="accent-ops-accent"
              />
              {opt}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}

export default function FilterPanel() {
  const { filters, services, setFilters } = useMonitorStore()

  const toggleMetricType = (type: MetricType) => {
    const current = filters.metricTypes
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type]
    if (next.length > 0) setFilters({ metricTypes: next })
  }

  const toggleService = (name: string) => {
    const current = filters.serviceNames
    const next = current.includes(name)
      ? current.filter((s) => s !== name)
      : [...current, name]
    setFilters({ serviceNames: next })
  }

  const toggleNode = (id: string) => {
    const current = filters.nodeIds
    const next = current.includes(id)
      ? current.filter((n) => n !== id)
      : [...current, id]
    setFilters({ nodeIds: next })
  }

  const serviceNames = services.map((s) => s.name)
  const filteredNodes = services
    .filter(
      (s) => filters.serviceNames.length === 0 || filters.serviceNames.includes(s.name)
    )
    .flatMap((s) => s.nodes.map((n) => n.id))
  const uniqueNodes = [...new Set(filteredNodes)]

  return (
    <div className="flex items-center gap-4 flex-wrap">
      <div className="flex items-center gap-1">
        {timeRanges.map((range) => (
          <button
            key={range}
            onClick={() => setFilters({ timeRange: range })}
            className={cn(
              'px-3 py-1 rounded-full text-xs font-mono transition-all duration-200',
              filters.timeRange === range
                ? 'bg-ops-accent/20 text-ops-accent shadow-[0_0_10px_rgba(6,214,160,0.3)]'
                : 'bg-ops-card text-ops-muted border border-ops-border hover:text-ops-text'
            )}
          >
            {range}
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-ops-border" />

      <div className="flex items-center gap-1.5">
        {metricOptions.map(({ type, label, icon: Icon }) => (
          <button
            key={type}
            onClick={() => toggleMetricType(type)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all duration-200',
              filters.metricTypes.includes(type)
                ? 'bg-ops-accent/20 text-ops-accent border border-ops-accent/40'
                : 'bg-ops-card text-ops-muted border border-ops-border hover:text-ops-text'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="h-6 w-px bg-ops-border" />

      <MultiSelectDropdown
        label="Services"
        options={serviceNames}
        selected={filters.serviceNames}
        onToggle={toggleService}
      />

      <MultiSelectDropdown
        label="Nodes"
        options={uniqueNodes}
        selected={filters.nodeIds}
        onToggle={toggleNode}
      />
    </div>
  )
}

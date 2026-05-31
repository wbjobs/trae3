import { useRef, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useMonitorStore } from '@/stores/monitorStore'
import type { Severity, AnomalyRecord } from '../../shared/types'

const severityConfig: Record<Severity, { label: string; color: string; bg: string }> = {
  low: { label: 'LOW', color: 'text-ops-accent', bg: 'bg-ops-accent/10 border-ops-accent/30' },
  medium: { label: 'MED', color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30' },
  high: { label: 'HIGH', color: 'text-ops-warning', bg: 'bg-ops-warning/10 border-ops-warning/30' },
  critical: { label: 'CRIT', color: 'text-ops-critical', bg: 'bg-ops-critical/10 border-ops-critical/30' },
}

const ROW_HEIGHT = 64
const CONTAINER_HEIGHT = 500
const BUFFER_ITEMS = 5

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function AnomalyRow({ anomaly, onClick }: { anomaly: AnomalyRecord; onClick: () => void }) {
  const sev = severityConfig[anomaly.severity]
  const isCritical = anomaly.severity === 'critical' && !anomaly.recoveredAt

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-4 py-3 border-b border-ops-border/50 hover:bg-ops-border/20 transition-colors h-16',
        isCritical && 'animate-pulse-glow'
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          className={cn(
            'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold border',
            sev.bg,
            sev.color
          )}
        >
          {sev.label}
        </span>
        <span className="text-ops-text text-xs font-mono uppercase">
          {anomaly.metricType}
        </span>
        {anomaly.recoveredAt && (
          <span className="text-ops-accent text-[10px] font-mono">RESOLVED</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-ops-muted text-xs">
        <span>{anomaly.serviceName}</span>
        <span className="text-ops-border">/</span>
        <span className="font-mono">{anomaly.nodeId}</span>
      </div>
      <div className="text-ops-muted text-[10px] font-mono mt-0.5">
        {formatTime(anomaly.detectedAt)}
      </div>
    </button>
  )
}

export default function VirtualAnomalyList() {
  const anomalies = useMonitorStore((s) => s.anomalies)
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const sortedAnomalies = useMemo(
    () => [...anomalies].sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime()),
    [anomalies]
  )

  const totalHeight = sortedAnomalies.length * ROW_HEIGHT

  const startIndex = useMemo(() => {
    const index = Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ITEMS
    return Math.max(0, index)
  }, [scrollTop])

  const endIndex = useMemo(() => {
    const visibleCount = Math.ceil(CONTAINER_HEIGHT / ROW_HEIGHT) + BUFFER_ITEMS * 2
    const index = startIndex + visibleCount
    return Math.min(sortedAnomalies.length, index)
  }, [startIndex, sortedAnomalies.length])

  const visibleItems = useMemo(
    () => sortedAnomalies.slice(startIndex, endIndex),
    [sortedAnomalies, startIndex, endIndex]
  )

  const offsetY = startIndex * ROW_HEIGHT

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }

  const handleClick = (id: string) => {
    navigate(`/anomaly/${id}`)
  }

  return (
    <div className="bg-ops-card rounded-xl border border-ops-border flex flex-col h-full animate-fade-in">
      <div className="px-4 py-3 border-b border-ops-border flex items-center justify-between shrink-0">
        <h3 className="text-ops-text text-sm font-semibold">Anomalies</h3>
        <span className="text-ops-muted text-xs font-mono">{sortedAnomalies.length}</span>
      </div>
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto relative"
        style={{ height: CONTAINER_HEIGHT }}
      >
        {sortedAnomalies.length === 0 && (
          <div className="flex items-center justify-center h-32 text-ops-muted text-sm">
            No anomalies detected
          </div>
        )}
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ transform: `translateY(${offsetY}px)`, position: 'absolute', width: '100%' }}>
            {visibleItems.map((anomaly) => (
              <AnomalyRow
                key={anomaly.id}
                anomaly={anomaly}
                onClick={() => handleClick(anomaly.id)}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

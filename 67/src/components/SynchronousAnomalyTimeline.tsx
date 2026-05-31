import { useState, useMemo } from 'react'
import type { SynchronousAnomaly, MetricType } from '../../shared/types'
import { Activity, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface SynchronousAnomalyTimelineProps {
  anomalies: SynchronousAnomaly[]
  onAnomalyClick?: (anomaly: SynchronousAnomaly) => void
}

const patternColors: Record<string, string> = {
  spike: '#ef4444',
  trend: '#f59e0b',
  oscillation: '#3b82f6',
  step: '#a78bfa',
}

const metricColors: Record<MetricType, string> = {
  cpu: '#06d6a0',
  memory: '#3b82f6',
  disk: '#f59e0b',
  network: '#a78bfa',
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatDuration(ms: number) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export default function SynchronousAnomalyTimeline({ anomalies, onAnomalyClick }: SynchronousAnomalyTimelineProps) {
  const [hoveredAnomaly, setHoveredAnomaly] = useState<{ anomaly: SynchronousAnomaly; x: number; y: number } | null>(null)
  const navigate = useNavigate()

  const { tracks, timeRange } = useMemo(() => {
    const trackMap = new Map<string, SynchronousAnomaly[]>()

    anomalies.forEach((a) => {
      const keys = new Set<string>()
      a.services.forEach((s) => keys.add(s))
      a.nodes.forEach((n) => keys.add(n))
      keys.forEach((key) => {
        if (!trackMap.has(key)) trackMap.set(key, [])
        trackMap.get(key)!.push(a)
      })
    })

    const trackList = Array.from(trackMap.entries()).map(([name, items]) => ({
      name,
      items: items.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()),
    }))

    let minTime = Infinity
    let maxTime = 0
    anomalies.forEach((a) => {
      const start = new Date(a.startTime).getTime()
      const end = new Date(a.endTime).getTime()
      minTime = Math.min(minTime, start)
      maxTime = Math.max(maxTime, end)
    })

    if (minTime === Infinity || maxTime === 0) {
      const now = Date.now()
      minTime = now - 3600000
      maxTime = now
    }

    const padding = (maxTime - minTime) * 0.05
    minTime -= padding
    maxTime += padding

    return { tracks: trackList, timeRange: { start: minTime, end: maxTime } }
  }, [anomalies])

  const trackHeight = 40
  const labelWidth = 120
  const headerHeight = 30

  const handleMouseEnter = (e: React.MouseEvent, anomaly: SynchronousAnomaly) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoveredAnomaly({
      anomaly,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    })
  }

  const handleMouseLeave = () => {
    setHoveredAnomaly(null)
  }

  const handleClick = (anomaly: SynchronousAnomaly) => {
    if (onAnomalyClick) {
      onAnomalyClick(anomaly)
    } else if (anomaly.anomalyIds.length > 0) {
      navigate(`/anomaly/${anomaly.anomalyIds[0]}`)
    }
  }

  if (anomalies.length === 0) {
    return (
      <div className="bg-ops-card rounded-xl border border-ops-border p-8 animate-fade-in">
        <div className="text-center text-ops-muted">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No synchronous anomalies detected</p>
        </div>
      </div>
    )
  }

  const sharedStartTime = anomalies.length > 0 ? anomalies[0].startTime : null

  return (
    <div className="bg-ops-card rounded-xl border border-ops-border p-4 animate-fade-in overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-ops-text text-sm font-semibold">Synchronous Anomaly Timeline</h3>
        <div className="flex items-center gap-3 text-xs text-ops-muted">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            <span className="font-mono">
              {formatTime(new Date(timeRange.start).toISOString())} - {formatTime(new Date(timeRange.end).toISOString())}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        {Object.entries(patternColors).map(([pattern, color]) => (
          <div key={pattern} className="flex items-center gap-1.5 text-xs">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: color }} />
            <span className="text-ops-muted capitalize">{pattern}</span>
          </div>
        ))}
      </div>

      <div className="relative overflow-x-auto">
        <div
          style={{
            minWidth: tracks.length > 0 ? `${labelWidth + 800}px` : '100%',
          }}
        >
          <div
            className="relative border-b border-ops-border"
            style={{ height: headerHeight, marginLeft: labelWidth }}
          >
            {Array.from({ length: 6 }).map((_, i) => {
              const time = timeRange.start + (timeRange.end - timeRange.start) * (i / 5)
              const x = ((time - timeRange.start) / (timeRange.end - timeRange.start)) * 100
              return (
                <div
                  key={i}
                  className="absolute top-0 text-[10px] font-mono text-ops-muted"
                  style={{ left: `${x}%`, transform: 'translateX(-50%)' }}
                >
                  {formatTime(new Date(time).toISOString())}
                </div>
              )
            })}
          </div>

          {sharedStartTime && (
            <div
              className="absolute top-0 bottom-0 w-px border-l-2 border-dashed border-ops-critical/50 z-10"
              style={{
                left: labelWidth + ((new Date(sharedStartTime).getTime() - timeRange.start) / (timeRange.end - timeRange.start)) * (100 - labelWidth / 8),
              }}
            />
          )}

          <div className="relative">
            {tracks.map((track, trackIdx) => (
              <div
                key={track.name}
                className="flex items-stretch border-b border-ops-border/50"
                style={{ height: trackHeight }}
              >
                <div
                  className="flex items-center pr-3 text-xs text-ops-muted font-mono shrink-0 border-r border-ops-border/30"
                  style={{ width: labelWidth }}
                >
                  <span className="truncate">{track.name}</span>
                </div>
                <div className="flex-1 relative">
                  {track.items.map((anomaly, itemIdx) => {
                    const start = new Date(anomaly.startTime).getTime()
                    const end = new Date(anomaly.endTime).getTime()
                    const left = ((start - timeRange.start) / (timeRange.end - timeRange.start)) * 100
                    const width = Math.max(0.5, ((end - start) / (timeRange.end - timeRange.start)) * 100)
                    const color = patternColors[anomaly.pattern] || '#64748b'
                    const uniqueKey = `${track.name}-${anomaly.startTime}-${itemIdx}`

                    return (
                      <div
                        key={uniqueKey}
                        className={cn(
                          'absolute top-1/2 -translate-y-1/2 rounded cursor-pointer transition-all duration-200 hover:opacity-80 hover:scale-y-110',
                          anomaly.correlation > 0.8 && 'animate-pulse'
                        )}
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          height: trackHeight * 0.6,
                          backgroundColor: color,
                          opacity: 0.7 + anomaly.correlation * 0.3,
                        }}
                        onMouseEnter={(e) => handleMouseEnter(e, anomaly)}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleClick(anomaly)}
                      >
                        <title>{`${anomaly.pattern} - ${anomaly.correlation.toFixed(2)}`}</title>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {hoveredAnomaly && (
        <div
          className="fixed z-50 bg-ops-card border border-ops-border rounded-lg p-3 shadow-xl pointer-events-none animate-fade-in"
          style={{
            left: hoveredAnomaly.x,
            top: hoveredAnomaly.y,
            transform: 'translate(-50%, -100%)',
            minWidth: 220,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-3 h-3 rounded"
              style={{ backgroundColor: patternColors[hoveredAnomaly.anomaly.pattern] }}
            />
            <span className="text-ops-text text-xs font-semibold capitalize">
              {hoveredAnomaly.anomaly.pattern} Pattern
            </span>
          </div>
          <div className="space-y-1 text-[10px] font-mono">
            <div className="flex justify-between gap-4">
              <span className="text-ops-muted">Correlation:</span>
              <span className="text-ops-accent">{(hoveredAnomaly.anomaly.correlation * 100).toFixed(1)}%</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ops-muted">Duration:</span>
              <span className="text-ops-text">
                {formatDuration(new Date(hoveredAnomaly.anomaly.endTime).getTime() - new Date(hoveredAnomaly.anomaly.startTime).getTime())}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ops-muted">Services:</span>
              <span className="text-ops-text">{hoveredAnomaly.anomaly.services.join(', ')}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ops-muted">Metrics:</span>
              <div className="flex gap-1">
                {hoveredAnomaly.anomaly.metricTypes.map((m, idx) => (
                  <span
                    key={idx}
                    className="px-1 rounded"
                    style={{ backgroundColor: metricColors[m] + '30', color: metricColors[m] }}
                  >
                    {m}
                  </span>
                ))}
              </div>
            </div>
            {hoveredAnomaly.anomaly.anomalyIds.length > 0 && (
              <div className="pt-1 mt-1 border-t border-ops-border">
                <span className="text-ops-muted block">Click to view details →</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

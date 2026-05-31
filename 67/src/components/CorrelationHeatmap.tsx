import { useState, useMemo } from 'react'
import type { CorrelationPair, MetricType } from '../../shared/types'
import { Activity } from 'lucide-react'

interface SeriesKey {
  metricType: MetricType
  serviceName: string
  nodeId: string
}

interface CorrelationHeatmapProps {
  pairs: CorrelationPair[]
  onCellClick?: (pair: CorrelationPair) => void
}

function getSeriesKey(s: SeriesKey): string {
  return `${s.metricType}-${s.serviceName}-${s.nodeId}`
}

function getSeriesLabel(s: SeriesKey): string {
  return `${s.metricType}/${s.nodeId}`
}

function getCorrelationColor(value: number): string {
  const clamped = Math.max(-1, Math.min(1, value))
  if (clamped === 0) return '#ffffff'
  if (clamped > 0) {
    const intensity = Math.floor(clamped * 255)
    return `rgb(255, ${255 - intensity}, ${255 - intensity})`
  } else {
    const intensity = Math.floor(Math.abs(clamped) * 255)
    return `rgb(${255 - intensity}, ${255 - intensity}, 255)`
  }
}

function getTextColor(value: number): string {
  return Math.abs(value) > 0.5 ? '#ffffff' : '#0f172a'
}

export default function CorrelationHeatmap({ pairs, onCellClick }: CorrelationHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{ pair: CorrelationPair; x: number; y: number } | null>(null)

  const { seriesKeys, correlationMatrix } = useMemo(() => {
    const keysMap = new Map<string, SeriesKey>()
    pairs.forEach((p) => {
      const keyA = getSeriesKey(p.seriesA)
      const keyB = getSeriesKey(p.seriesB)
      if (!keysMap.has(keyA)) keysMap.set(keyA, p.seriesA)
      if (!keysMap.has(keyB)) keysMap.set(keyB, p.seriesB)
    })

    const keys = Array.from(keysMap.values())
    const matrix = new Map<string, CorrelationPair>()

    pairs.forEach((p) => {
      const keyA = getSeriesKey(p.seriesA)
      const keyB = getSeriesKey(p.seriesB)
      matrix.set(`${keyA}-${keyB}`, p)
      matrix.set(`${keyB}-${keyA}`, { ...p, correlation: p.correlation })
    })

    return { seriesKeys: keys, correlationMatrix: matrix }
  }, [pairs])

  const cellSize = Math.min(48, Math.max(24, 600 / Math.max(seriesKeys.length, 1)))
  const labelWidth = 100
  const labelHeight = 24

  const handleMouseEnter = (e: React.MouseEvent, pair: CorrelationPair) => {
    const rect = e.currentTarget.getBoundingClientRect()
    setHoveredCell({
      pair,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    })
  }

  const handleMouseLeave = () => {
    setHoveredCell(null)
  }

  if (seriesKeys.length === 0) {
    return (
      <div className="bg-ops-card rounded-xl border border-ops-border p-8 animate-fade-in flex items-center justify-center">
        <div className="text-center text-ops-muted">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No correlation data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-ops-card rounded-xl border border-ops-border p-4 animate-fade-in overflow-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-ops-text text-sm font-semibold">Correlation Heatmap</h3>
        <div className="flex items-center gap-2 text-xs text-ops-muted">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgb(0,0,255)' }} />
            <span>-1</span>
          </div>
          <div className="w-16 h-2 rounded" style={{ background: 'linear-gradient(to right, rgb(0,0,255), white, rgb(255,0,0))' }} />
          <div className="flex items-center gap-1">
            <span>+1</span>
            <div className="w-3 h-3 rounded" style={{ backgroundColor: 'rgb(255,0,0)' }} />
          </div>
        </div>
      </div>

      <div className="relative">
        <div style={{ paddingLeft: labelWidth, paddingTop: labelHeight }}>
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${seriesKeys.length}, ${cellSize}px)`,
              gridTemplateRows: `repeat(${seriesKeys.length}, ${cellSize}px)`,
            }}
          >
            {seriesKeys.map((rowKey, rowIdx) =>
              seriesKeys.map((colKey, colIdx) => {
                const pairKey = `${getSeriesKey(rowKey)}-${getSeriesKey(colKey)}`
                const pair = correlationMatrix.get(pairKey)
                const value = pair?.correlation ?? (rowIdx === colIdx ? 1 : 0)
                const isDiagonal = rowIdx === colIdx

                return (
                  <div
                    key={`${rowIdx}-${colIdx}`}
                    className="flex items-center justify-center cursor-pointer transition-all duration-200 hover:scale-105 hover:z-10"
                    style={{
                      width: cellSize,
                      height: cellSize,
                      backgroundColor: isDiagonal ? '#334155' : getCorrelationColor(value),
                      color: isDiagonal ? '#e2e8f0' : getTextColor(value),
                      fontSize: Math.max(9, cellSize / 4),
                      fontFamily: 'monospace',
                      fontWeight: 'bold',
                    }}
                    onMouseEnter={(e) => pair && handleMouseEnter(e, pair)}
                    onMouseLeave={handleMouseLeave}
                    onClick={() => pair && onCellClick?.(pair)}
                  >
                    {!isDiagonal && pair && value.toFixed(2)}
                    {isDiagonal && '1.00'}
                  </div>
                )
              })
            )}
          </div>
        </div>

        <div
          className="absolute top-0 left-0 flex"
          style={{ paddingLeft: labelWidth, paddingTop: 0 }}
        >
          {seriesKeys.map((key, idx) => (
            <div
              key={idx}
              className="flex items-center justify-center text-ops-muted text-[10px] font-mono"
              style={{
                width: cellSize,
                height: labelHeight,
                transform: 'rotate(-45deg)',
                transformOrigin: 'bottom left',
                whiteSpace: 'nowrap',
              }}
            >
              {getSeriesLabel(key)}
            </div>
          ))}
        </div>

        <div
          className="absolute top-0 left-0 flex flex-col"
          style={{ paddingTop: labelHeight, paddingLeft: 0 }}
        >
          {seriesKeys.map((key, idx) => (
            <div
              key={idx}
              className="flex items-center justify-end text-ops-muted text-[10px] font-mono pr-2"
              style={{
                width: labelWidth,
                height: cellSize,
                whiteSpace: 'nowrap',
              }}
            >
              {getSeriesLabel(key)}
            </div>
          ))}
        </div>
      </div>

      {hoveredCell && (
        <div
          className="fixed z-50 bg-ops-card border border-ops-border rounded-lg p-3 shadow-xl pointer-events-none animate-fade-in"
          style={{
            left: hoveredCell.x,
            top: hoveredCell.y,
            transform: 'translate(-50%, -100%)',
            minWidth: 200,
          }}
        >
          <div className="text-ops-text text-xs font-semibold mb-2">
            {getSeriesLabel(hoveredCell.pair.seriesA)} × {getSeriesLabel(hoveredCell.pair.seriesB)}
          </div>
          <div className="space-y-1 text-[10px] font-mono">
            <div className="flex justify-between gap-4">
              <span className="text-ops-muted">Correlation:</span>
              <span className={hoveredCell.pair.correlation > 0 ? 'text-red-400' : 'text-blue-400'}>
                {hoveredCell.pair.correlation.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ops-muted">Lag:</span>
              <span className="text-ops-text">{hoveredCell.pair.lagMs}ms</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-ops-muted">Significance:</span>
              <span className="text-ops-text">{hoveredCell.pair.significance.toFixed(4)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

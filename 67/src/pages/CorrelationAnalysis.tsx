import { useEffect, useState, useMemo, useCallback } from 'react'
import { Activity, RefreshCw, Clock, Filter } from 'lucide-react'
import { useMonitorStore } from '@/stores/monitorStore'
import CorrelationHeatmap from '@/components/CorrelationHeatmap'
import SynchronousAnomalyTimeline from '@/components/SynchronousAnomalyTimeline'
import MetricChart from '@/components/MetricChart'
import type { CorrelationResult, CorrelationPair, MetricType, MetricSeries } from '../../shared/types'
import { cn } from '@/lib/utils'

const timeRanges = [
  { value: '15m', label: '15 min' },
  { value: '1h', label: '1 hour' },
  { value: '6h', label: '6 hours' },
  { value: '24h', label: '24 hours' },
]

const metricTypes: { value: MetricType; label: string }[] = [
  { value: 'cpu', label: 'CPU' },
  { value: 'memory', label: 'Memory' },
  { value: 'disk', label: 'Disk' },
  { value: 'network', label: 'Network' },
]

function getTimeRange(range: string) {
  const now = new Date()
  const end = now.toISOString()
  let start: Date
  switch (range) {
    case '15m':
      start = new Date(now.getTime() - 15 * 60000)
      break
    case '6h':
      start = new Date(now.getTime() - 6 * 3600000)
      break
    case '24h':
      start = new Date(now.getTime() - 24 * 3600000)
      break
    default:
      start = new Date(now.getTime() - 3600000)
  }
  return { startTime: start.toISOString(), endTime: end }
}

export default function CorrelationAnalysis() {
  const [timeRange, setTimeRange] = useState('1h')
  const [selectedMetricTypes, setSelectedMetricTypes] = useState<MetricType[]>(['cpu', 'memory', 'disk', 'network'])
  const [threshold, setThreshold] = useState(0.5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedPair, setSelectedPair] = useState<CorrelationPair | null>(null)
  const [pairSeries, setPairSeries] = useState<MetricSeries[]>([])

  const { correlationResult, setCorrelationResult } = useMonitorStore()

  const fetchCorrelation = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true)
    setLoading(!showRefreshing)
    setError(null)

    try {
      const { startTime, endTime } = getTimeRange(timeRange)
      const params = new URLSearchParams()
      params.set('startTime', startTime)
      params.set('endTime', endTime)
      params.set('metricTypes', selectedMetricTypes.join(','))
      params.set('threshold', threshold.toString())

      const res = await fetch(`/api/metrics/correlation?${params}`)
      if (!res.ok) throw new Error('Failed to fetch correlation data')
      const data: CorrelationResult = await res.json()
      setCorrelationResult(data)
      setLastRefresh(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }, [timeRange, selectedMetricTypes, threshold])

  useEffect(() => {
    fetchCorrelation()
    return () => setCorrelationResult(null)
  }, [fetchCorrelation])

  const handleCellClick = useCallback(async (pair: CorrelationPair) => {
    setSelectedPair(pair)

    try {
      const { startTime, endTime } = getTimeRange(timeRange)
      const params = new URLSearchParams()
      params.set('startTime', startTime)
      params.set('endTime', endTime)
      params.set('metricTypes', [pair.seriesA.metricType, pair.seriesB.metricType].join(','))
      params.set('serviceNames', [pair.seriesA.serviceName, pair.seriesB.serviceName].join(','))
      params.set('nodeIds', [pair.seriesA.nodeId, pair.seriesB.nodeId].join(','))

      const res = await fetch(`/api/metrics?${params}`)
      const data = await res.json()
      setPairSeries(data.series ?? [])
    } catch {
    }
  }, [timeRange])

  const toggleMetricType = (type: MetricType) => {
    setSelectedMetricTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const filteredPairs = useMemo(() => {
    if (!correlationResult) return []
    return correlationResult.pairs.filter((p) => Math.abs(p.correlation) >= threshold)
  }, [correlationResult, threshold])

  return (
    <div className="flex flex-col h-full gap-4 p-4 overflow-y-auto">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-ops-accent" />
          <h1 className="text-ops-text text-lg font-semibold">Correlation Analysis</h1>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchCorrelation(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-ops-card border border-ops-border rounded-lg text-ops-muted hover:text-ops-text hover:border-ops-accent/50 transition-colors text-sm disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            <span>Refresh</span>
          </button>

          {lastRefresh && (
            <div className="flex items-center gap-1.5 text-xs text-ops-muted">
              <Clock className="w-3 h-3" />
              <span className="font-mono">{lastRefresh.toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </div>

      <div className="bg-ops-card rounded-xl border border-ops-border p-4 shrink-0 animate-fade-in">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-ops-accent" />
          <span className="text-ops-text text-sm font-semibold">Filters</span>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-ops-muted text-xs">Time Range:</span>
            <div className="flex gap-1">
              {timeRanges.map((tr) => (
                <button
                  key={tr.value}
                  onClick={() => setTimeRange(tr.value)}
                  className={cn(
                    'px-3 py-1 text-xs rounded border transition-colors',
                    timeRange === tr.value
                      ? 'bg-ops-accent/20 border-ops-accent/50 text-ops-accent'
                      : 'bg-ops-dark border-ops-border text-ops-muted hover:border-ops-accent/30 hover:text-ops-text'
                  )}
                >
                  {tr.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-ops-muted text-xs">Metrics:</span>
            <div className="flex gap-1">
              {metricTypes.map((mt) => (
                <button
                  key={mt.value}
                  onClick={() => toggleMetricType(mt.value)}
                  className={cn(
                    'px-3 py-1 text-xs rounded border transition-colors',
                    selectedMetricTypes.includes(mt.value)
                      ? 'bg-ops-accent/20 border-ops-accent/50 text-ops-accent'
                      : 'bg-ops-dark border-ops-border text-ops-muted hover:border-ops-accent/30 hover:text-ops-text'
                  )}
                >
                  {mt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-ops-muted text-xs">Threshold:</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-32 accent-ops-accent"
            />
            <span className="text-ops-text text-xs font-mono w-10">
              {(threshold * 100).toFixed(0)}%
            </span>
          </div>

          {correlationResult && (
            <div className="ml-auto flex items-center gap-4 text-xs text-ops-muted">
              <span>
                <span className="text-ops-text font-mono">{correlationResult.pairs.length}</span> pairs
              </span>
              <span>
                <span className="text-ops-text font-mono">{correlationResult.analysisTimeMs}</span>ms
              </span>
              <span>
                <span className="text-ops-text font-mono">{correlationResult.synchronousAnomalies.length}</span> sync anomalies
              </span>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-ops-critical/10 border border-ops-critical/30 rounded-lg p-3 text-ops-critical text-sm shrink-0">
          {error}
        </div>
      )}

      {loading && !correlationResult ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-ops-muted">
            <Activity className="w-12 h-12 mx-auto mb-3 opacity-50 animate-pulse" />
            <p className="text-sm">Analyzing correlations...</p>
          </div>
        </div>
      ) : (
        <>
          <div className="shrink-0">
            <CorrelationHeatmap pairs={filteredPairs} onCellClick={handleCellClick} />
          </div>

          <div className="shrink-0">
            <SynchronousAnomalyTimeline anomalies={correlationResult?.synchronousAnomalies ?? []} />
          </div>

          {selectedPair && (
            <div className="shrink-0 animate-fade-in">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-ops-text text-sm font-semibold">
                  Correlated Series: {selectedPair.seriesA.metricType}/{selectedPair.seriesA.nodeId} × {selectedPair.seriesB.metricType}/{selectedPair.seriesB.nodeId}
                </h3>
                <div className="flex items-center gap-4 text-xs font-mono">
                  <span className="text-ops-muted">
                    Correlation: <span className={selectedPair.correlation > 0 ? 'text-red-400' : 'text-blue-400'}>{selectedPair.correlation.toFixed(4)}</span>
                  </span>
                  <span className="text-ops-muted">
                    Lag: <span className="text-ops-text">{selectedPair.lagMs}ms</span>
                  </span>
                  <span className="text-ops-muted">
                    Significance: <span className="text-ops-text">{selectedPair.significance.toFixed(4)}</span>
                  </span>
                </div>
              </div>
              <MetricChart series={pairSeries} height="300px" />
            </div>
          )}

          {filteredPairs.length > 0 && !selectedPair && (
            <div className="grid grid-cols-2 gap-4">
              {filteredPairs.slice(0, 4).map((pair, idx) => (
                <div key={idx} className="shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-ops-text text-xs font-semibold">
                      {pair.seriesA.metricType}/{pair.seriesA.nodeId} × {pair.seriesB.metricType}/{pair.seriesB.nodeId}
                    </h4>
                    <span className="text-ops-muted text-[10px] font-mono">
                      r = {pair.correlation.toFixed(3)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

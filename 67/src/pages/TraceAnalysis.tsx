import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, RefreshCw, AlertTriangle, Clock, GitBranch } from 'lucide-react'
import { useMonitorStore } from '@/stores/monitorStore'
import TraceGraph from '@/components/TraceGraph'
import RootCausePanel from '@/components/RootCausePanel'
import SynchronousAnomalyTimeline from '@/components/SynchronousAnomalyTimeline'
import type { TraceResult } from '../../shared/types'
import { cn } from '@/lib/utils'

const AUTO_REFRESH_INTERVAL = 10000

export default function TraceAnalysis() {
  const { anomalyId } = useParams<{ anomalyId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { traceResult, setTraceResult } = useMonitorStore()
  const anomalies = useMonitorStore((s) => s.anomalies)

  const targetAnomaly = anomalies.find((a) => a.id === anomalyId)

  const fetchTrace = async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true)
    setLoading(!showRefreshing)
    setError(null)

    try {
      const res = await fetch(`/api/anomalies/${anomalyId}/trace`)
      if (!res.ok) throw new Error('Failed to fetch trace data')
      const data: { trace: TraceResult } = await res.json()
      if (data.trace) {
        setTraceResult(data.trace)
        setLastRefresh(new Date())
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    if (anomalyId) {
      fetchTrace()
    }

    return () => {
      setTraceResult(null)
    }
  }, [anomalyId])

  useEffect(() => {
    if (!targetAnomaly || targetAnomaly.recoveredAt) return

    const interval = setInterval(() => {
      fetchTrace(true)
    }, AUTO_REFRESH_INTERVAL)

    return () => clearInterval(interval)
  }, [targetAnomaly])

  const handleBack = () => {
    navigate('/anomalies')
  }

  if (loading && !traceResult) {
    return (
      <div className="flex flex-col h-full gap-4 p-4">
        <div className="animate-pulse space-y-4">
          <div className="h-12 bg-ops-card rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2 h-[500px] bg-ops-card rounded-xl" />
            <div className="space-y-4">
              <div className="h-[300px] bg-ops-card rounded-xl" />
              <div className="h-[200px] bg-ops-card rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full gap-4 p-4">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 px-3 py-2 bg-ops-card border border-ops-border rounded-lg text-ops-muted hover:text-ops-text hover:border-ops-accent/50 transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Anomalies</span>
          </button>
          <div className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-ops-accent" />
            <h1 className="text-ops-text text-lg font-semibold">Fault Trace Analysis</h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {targetAnomaly && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-ops-card border border-ops-border rounded-lg">
              <AlertTriangle className={cn(
                'w-4 h-4',
                targetAnomaly.severity === 'critical' && 'text-ops-critical',
                targetAnomaly.severity === 'high' && 'text-ops-warning',
                targetAnomaly.severity === 'medium' && 'text-blue-400',
                targetAnomaly.severity === 'low' && 'text-ops-accent',
              )} />
              <span className="text-ops-text text-sm font-mono uppercase">{targetAnomaly.metricType}</span>
              <span className="text-ops-muted text-xs">/</span>
              <span className="text-ops-muted text-sm font-mono">{targetAnomaly.nodeId}</span>
              {targetAnomaly.recoveredAt ? (
                <span className="px-1.5 py-0.5 bg-ops-accent/20 text-ops-accent text-[10px] font-mono rounded">RESOLVED</span>
              ) : (
                <span className="px-1.5 py-0.5 bg-ops-critical/20 text-ops-critical text-[10px] font-mono rounded animate-pulse">ACTIVE</span>
              )}
            </div>
          )}

          <button
            onClick={() => fetchTrace(true)}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-ops-card border border-ops-border rounded-lg text-ops-muted hover:text-ops-text hover:border-ops-accent/50 transition-colors text-sm disabled:opacity-50"
          >
            <RefreshCw className={cn('w-4 h-4', isRefreshing && 'animate-spin')} />
            <span>Refresh</span>
          </button>

          {lastRefresh && (
            <div className="flex items-center gap-1.5 text-xs text-ops-muted">
              <Clock className="w-3 h-3" />
              <span className="font-mono">
                {lastRefresh.toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>
      </div>

      {targetAnomaly && (
        <div className="bg-ops-card rounded-xl border border-ops-border p-4 shrink-0 animate-fade-in">
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-ops-muted text-xs">Description</span>
              <p className="text-ops-text font-mono mt-0.5">{targetAnomaly.description}</p>
            </div>
            <div>
              <span className="text-ops-muted text-xs">Service</span>
              <p className="text-ops-text font-mono mt-0.5">{targetAnomaly.serviceName}</p>
            </div>
            <div>
              <span className="text-ops-muted text-xs">Detected At</span>
              <p className="text-ops-text font-mono mt-0.5">
                {new Date(targetAnomaly.detectedAt).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-ops-muted text-xs">Root Cause Hint</span>
              <p className="text-ops-text font-mono mt-0.5">{targetAnomaly.rootCauseHint}</p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-ops-critical/10 border border-ops-critical/30 rounded-lg p-3 text-ops-critical text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 flex-1 min-h-0">
        <div className="col-span-2 flex flex-col min-h-0">
          <TraceGraph trace={traceResult} />
        </div>
        <div className="col-span-1 flex flex-col gap-4 min-h-0 overflow-y-auto">
          <RootCausePanel rootCauses={traceResult?.rootCauses ?? []} />
        </div>
      </div>

      <div className="shrink-0">
        <SynchronousAnomalyTimeline anomalies={traceResult ? [] : []} />
      </div>
    </div>
  )
}

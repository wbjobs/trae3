import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Zap, Clock, Shield, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import MetricChart from '@/components/MetricChart'
import type { AnomalyDetail, AnomalyEventType } from '../../shared/types'

const severityConfig: Record<string, { color: string; bg: string }> = {
  low: { color: 'text-ops-accent', bg: 'bg-ops-accent/10 border-ops-accent/30' },
  medium: { color: 'text-blue-400', bg: 'bg-blue-400/10 border-blue-400/30' },
  high: { color: 'text-ops-warning', bg: 'bg-ops-warning/10 border-ops-warning/30' },
  critical: { color: 'text-ops-critical', bg: 'bg-ops-critical/10 border-ops-critical/30' },
}

const eventIcon: Record<AnomalyEventType, typeof AlertTriangle> = {
  trigger: AlertTriangle,
  escalate: Zap,
  mitigate: Shield,
  resolve: CheckCircle,
}

const eventColor: Record<AnomalyEventType, string> = {
  trigger: 'bg-ops-critical',
  escalate: 'bg-ops-warning',
  mitigate: 'bg-blue-400',
  resolve: 'bg-ops-accent',
}

export default function AnomalyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [detail, setDetail] = useState<AnomalyDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    fetch(`/api/anomalies/${id}`)
      .then((res) => res.json())
      .then((data) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-ops-muted">
        Loading anomaly details...
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-ops-muted">
        <AlertTriangle className="w-10 h-10" />
        <span>Anomaly not found</span>
        <button
          onClick={() => navigate('/')}
          className="text-ops-accent hover:underline text-sm"
        >
          Back to Dashboard
        </button>
      </div>
    )
  }

  const sev = severityConfig[detail.severity]

  return (
    <div className="p-6 max-w-5xl mx-auto animate-fade-in">
      <button
        onClick={() => navigate('/')}
        className="flex items-center gap-1.5 text-ops-muted hover:text-ops-text transition-colors mb-6 text-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </button>

      <div className="flex items-center gap-3 mb-6">
        <span className={cn('px-2 py-1 rounded text-xs font-mono font-bold border', sev.bg, sev.color)}>
          {detail.severity.toUpperCase()}
        </span>
        <h1 className="text-ops-text text-xl font-bold">{detail.metricType.toUpperCase()}</h1>
        <span className="text-ops-muted text-sm">
          {detail.serviceName} / <span className="font-mono">{detail.nodeId}</span>
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 space-y-6">
          <div className="bg-ops-card border border-ops-border rounded-xl p-5">
            <h2 className="text-ops-text text-sm font-semibold mb-4">Timeline</h2>
            <div className="relative pl-6">
              <div className="absolute left-2 top-0 bottom-0 w-px bg-ops-border" />
              {(detail.timeline ?? []).map((evt, i) => {
                const Icon = eventIcon[evt.type] || Clock
                const color = eventColor[evt.type] || 'bg-ops-muted'
                return (
                  <div key={i} className="relative mb-4 last:mb-0">
                    <div
                      className={cn(
                        'absolute -left-6 top-0.5 w-4 h-4 rounded-full flex items-center justify-center',
                        color
                      )}
                    >
                      <Icon className="w-2.5 h-2.5 text-white" />
                    </div>
                    <div className="ml-2">
                      <div className="flex items-center gap-2">
                        <span className="text-ops-text text-sm font-semibold">{evt.event}</span>
                        <span className={cn('text-[10px] font-mono uppercase px-1.5 py-0.5 rounded', color + '/20', 'text-ops-text')}>
                          {evt.type}
                        </span>
                      </div>
                      <span className="text-ops-muted text-xs font-mono">
                        {new Date(evt.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-ops-card border border-ops-border rounded-xl p-5">
            <h2 className="text-ops-text text-sm font-semibold mb-4">Related Metrics</h2>
            <div className="space-y-4">
              {(detail.relatedSeries ?? []).map((series, i) => (
                <MetricChart key={i} series={[series]} height="160px" />
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-1 space-y-6">
          <div className="bg-ops-card border border-ops-border rounded-xl p-5">
            <h2 className="text-ops-text text-sm font-semibold mb-3">Details</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ops-muted">Detected</span>
                <span className="text-ops-text font-mono text-xs">
                  {new Date(detail.detectedAt).toLocaleString()}
                </span>
              </div>
              {detail.recoveredAt && (
                <div className="flex justify-between">
                  <span className="text-ops-muted">Recovered</span>
                  <span className="text-ops-accent font-mono text-xs">
                    {new Date(detail.recoveredAt).toLocaleString()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-ops-muted">Service</span>
                <span className="text-ops-text">{detail.serviceName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ops-muted">Node</span>
                <span className="text-ops-text font-mono">{detail.nodeId}</span>
              </div>
            </div>
          </div>

          <div className="bg-ops-card border border-ops-warning/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4 text-ops-warning" />
              <h2 className="text-ops-text text-sm font-semibold">Root Cause Hint</h2>
            </div>
            <p className="text-ops-muted text-sm leading-relaxed">
              {detail.rootCauseHint}
            </p>
          </div>

          <div className="bg-ops-card border border-ops-border rounded-xl p-5">
            <h2 className="text-ops-text text-sm font-semibold mb-2">Description</h2>
            <p className="text-ops-muted text-sm leading-relaxed">{detail.description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

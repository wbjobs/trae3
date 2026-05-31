import { useState } from 'react'
import type { RootCauseCandidate } from '../../shared/types'
import { AlertTriangle, ChevronDown, ChevronRight, Target, Zap, Shield, CheckCircle, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RootCausePanelProps {
  rootCauses: RootCauseCandidate[]
  onCandidateClick?: (candidate: RootCauseCandidate) => void
}

function getSeverityIcon(evidence: string) {
  const lower = evidence.toLowerCase()
  if (lower.includes('critical') || lower.includes('error') || lower.includes('fail')) {
    return XCircle
  }
  if (lower.includes('warning') || lower.includes('high') || lower.includes('anomaly')) {
    return AlertTriangle
  }
  return CheckCircle
}

function getSeverityColor(evidence: string) {
  const lower = evidence.toLowerCase()
  if (lower.includes('critical') || lower.includes('error') || lower.includes('fail')) {
    return 'text-ops-critical'
  }
  if (lower.includes('warning') || lower.includes('high') || lower.includes('anomaly')) {
    return 'text-ops-warning'
  }
  return 'text-ops-accent'
}

function CandidateItem({ candidate, onClick, isExpanded, onToggle }: {
  candidate: RootCauseCandidate
  onClick?: () => void
  isExpanded: boolean
  onToggle: () => void
}) {
  const confidencePercent = Math.round(candidate.confidence * 100)
  const barWidth = Math.max(4, confidencePercent)

  return (
    <div
      className="border border-ops-border rounded-lg overflow-hidden transition-all duration-200 hover:border-ops-accent/50"
    >
      <button
        onClick={onToggle}
        className="w-full p-3 flex items-center gap-3 hover:bg-ops-border/10 transition-colors"
      >
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-ops-muted" />
          ) : (
            <ChevronRight className="w-4 h-4 text-ops-muted" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-3.5 h-3.5 text-ops-accent" />
            <span className="text-ops-text text-sm font-semibold truncate">
              {candidate.nodeName}
            </span>
            <span className="text-ops-muted text-[10px] font-mono">
              Score: {candidate.score.toFixed(2)}
            </span>
          </div>
          <div className="relative h-2 bg-ops-dark rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-ops-accent to-ops-accent/60 rounded-full transition-all duration-500"
              style={{ width: `${barWidth}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-end pr-2">
              <span className="text-[9px] font-mono font-bold text-white drop-shadow">
                {confidencePercent}%
              </span>
            </div>
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 animate-fade-in">
          <div className="ml-7 space-y-3">
            {candidate.evidence.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <Zap className="w-3.5 h-3.5 text-ops-warning" />
                  <span className="text-ops-muted text-xs font-semibold">Evidence</span>
                </div>
                <div className="space-y-1">
                  {candidate.evidence.map((ev, idx) => {
                    const Icon = getSeverityIcon(ev)
                    const color = getSeverityColor(ev)
                    return (
                      <div key={idx} className="flex items-start gap-2 text-xs">
                        <Icon className={cn('w-3.5 h-3.5 mt-0.5 flex-shrink-0', color)} />
                        <span className="text-ops-text font-mono text-[11px]">{ev}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {candidate.impactScope.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-ops-critical" />
                  <span className="text-ops-muted text-xs font-semibold">Impact Scope</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {candidate.impactScope.map((scope, idx) => (
                    <span
                      key={idx}
                      className="px-2 py-0.5 bg-ops-critical/10 text-ops-critical text-[10px] font-mono rounded border border-ops-critical/30"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Shield className="w-3.5 h-3.5 text-ops-accent" />
                <span className="text-ops-muted text-xs font-semibold">Recommended Action</span>
              </div>
              <div className="p-2 bg-ops-accent/5 border border-ops-accent/20 rounded text-xs text-ops-text font-mono">
                {candidate.recommendedAction}
              </div>
            </div>

            <button
              onClick={onClick}
              className="w-full mt-2 px-3 py-1.5 bg-ops-accent/10 hover:bg-ops-accent/20 text-ops-accent text-xs font-semibold rounded transition-colors"
            >
              View Details
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function RootCausePanel({ rootCauses, onCandidateClick }: RootCausePanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(rootCauses[0]?.nodeId ?? null)

  const sortedCauses = [...rootCauses].sort((a, b) => b.confidence - a.confidence)

  const maxScore = Math.max(...sortedCauses.map((c) => c.score), 1)

  if (sortedCauses.length === 0) {
    return (
      <div className="bg-ops-card rounded-xl border border-ops-border p-8 animate-fade-in">
        <div className="text-center text-ops-muted">
          <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No root cause analysis available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-ops-card rounded-xl border border-ops-border p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-ops-text text-sm font-semibold">Root Cause Analysis</h3>
        <span className="text-ops-muted text-xs font-mono">
          {sortedCauses.length} candidate{sortedCauses.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {sortedCauses.map((candidate, idx) => (
          <CandidateItem
            key={candidate.nodeId}
            candidate={{
              ...candidate,
              score: candidate.score / maxScore,
            }}
            onClick={() => onCandidateClick?.(candidate)}
            isExpanded={expandedId === candidate.nodeId}
            onToggle={() => setExpandedId(expandedId === candidate.nodeId ? null : candidate.nodeId)}
          />
        ))}
      </div>
    </div>
  )
}

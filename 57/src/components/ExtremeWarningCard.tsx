import React from 'react'
import type { ExtremeWarning } from '../../shared/types'
import { METRIC_LABELS, METRIC_UNITS } from '../../shared/types'

interface ExtremeWarningCardProps {
  warning: ExtremeWarning
}

const LEVEL_STYLES: Record<string, { border: string; bg: string; text: string; glow: string }> = {
  watch: { border: 'border-blue-500/50', bg: 'bg-blue-500/10', text: 'text-blue-400', glow: '' },
  warning: { border: 'border-yellow-500/50', bg: 'bg-yellow-500/10', text: 'text-yellow-400', glow: '' },
  critical: { border: 'border-red-500/50', bg: 'bg-red-500/10', text: 'text-red-400', glow: 'animate-pulse-glow' },
}

const LEVEL_LABELS: Record<string, string> = {
  watch: '关注',
  warning: '预警',
  critical: '危急',
}

function ExtremeWarningCard({ warning }: ExtremeWarningCardProps) {
  const style = LEVEL_STYLES[warning.warningLevel]
  const percentage = Math.min(100, (warning.currentValue / warning.p99) * 100)

  return (
    <div
      className={`card p-4 border-l-4 ${style.border} ${style.glow}`}
      style={{
        borderLeftWidth: '3px',
        boxShadow:
          warning.warningLevel === 'critical'
            ? `0 0 12px rgba(239, 68, 68, 0.3)`
            : undefined,
      }}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${style.bg} ${style.text}`}>
            {LEVEL_LABELS[warning.warningLevel]}
          </span>
          <span className="text-sm font-medium text-white">{warning.stationName}</span>
        </div>
        <span className="text-xs text-gray-500">
          {METRIC_LABELS[warning.metric] || warning.metric}
        </span>
      </div>

      <div className="flex items-baseline gap-2 mb-3">
        <span className={`text-2xl font-mono font-bold ${style.text}`}>
          {warning.currentValue.toFixed(2)}
        </span>
        <span className="text-sm text-gray-500">{METRIC_UNITS[warning.metric]}</span>
      </div>

      <div className="space-y-1.5 mb-3">
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">P95 阈值</span>
          <span className="font-mono text-yellow-400">{warning.p95.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">P99 阈值</span>
          <span className="font-mono text-orange-400">{warning.p99.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-gray-500">历史最大</span>
          <span className="font-mono text-red-400">{warning.maxHistorical.toFixed(2)}</span>
        </div>
      </div>

      <div className="w-full bg-primary-light/30 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            percentage > 100 ? 'bg-red-500' : percentage > 80 ? 'bg-yellow-500' : 'bg-blue-500'
          }`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-[10px] text-gray-600">
        <span>0</span>
        <span>P99: {warning.p99.toFixed(1)}</span>
      </div>

      <div className="text-xs text-gray-400 mt-2">{warning.message}</div>
    </div>
  )
}

export default React.memo(ExtremeWarningCard)

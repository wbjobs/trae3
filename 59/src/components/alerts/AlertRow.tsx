import type { Alert } from '../../../shared/types'
import { AlertTriangle, AlertOctagon } from 'lucide-react'

interface AlertRowProps {
  alert: Alert
  onClick: () => void
  onConfirm: () => void
  onResolve: () => void
}

const levelConfig: Record<Alert['level'], { label: string; color: string; bg: string; border: string; icon: typeof AlertTriangle }> = {
  critical: { label: 'CRITICAL', color: 'text-red-alert', bg: 'bg-red-alert/15', border: 'border-l-red-alert', icon: AlertOctagon },
  major: { label: 'MAJOR', color: 'text-amber-warn', bg: 'bg-amber-warn/15', border: 'border-l-amber-warn', icon: AlertTriangle },
  minor: { label: 'MINOR', color: 'text-yellow-400', bg: 'bg-yellow-400/15', border: 'border-l-yellow-400', icon: AlertTriangle },
}

const statusConfig: Record<Alert['status'], { label: string; bg: string; color: string }> = {
  active: { label: 'ACTIVE', bg: 'bg-red-alert/20', color: 'text-red-alert' },
  confirmed: { label: 'CONFIRMED', bg: 'bg-amber-warn/20', color: 'text-amber-warn' },
  resolved: { label: 'RESOLVED', bg: 'bg-green-ok/20', color: 'text-green-ok' },
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

export default function AlertRow({ alert, onClick, onConfirm, onResolve }: AlertRowProps) {
  const lv = levelConfig[alert.level]
  const st = statusConfig[alert.status]
  const Icon = lv.icon

  return (
    <tr
      className={`border-l-4 ${lv.border} border-b border-slate-700/50 hover:bg-steel-gray/60 cursor-pointer transition-colors duration-150`}
      onClick={onClick}
    >
      <td className="px-4 py-3">
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold ${lv.bg} ${lv.color}`}>
          <Icon className="w-3 h-3" />
          {lv.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-200 font-body">{alert.deviceName}</td>
      <td className="px-4 py-3 text-sm text-slate-300 font-mono">{alert.paramKey}</td>
      <td className="px-4 py-3 text-sm text-slate-200 font-mono">{alert.paramValue}</td>
      <td className="px-4 py-3 text-sm text-slate-400 font-mono">{alert.threshold}</td>
      <td className="px-4 py-3 text-xs text-slate-400">{formatTime(alert.createdAt)}</td>
      <td className="px-4 py-3">
        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${st.bg} ${st.color}`}>
          {st.label}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          {alert.status === 'active' && (
            <button
              onClick={onConfirm}
              className="px-3 py-1 text-xs rounded bg-amber-warn/20 text-amber-warn hover:bg-amber-warn/30 transition-colors"
            >
              确认
            </button>
          )}
          {alert.status === 'confirmed' && (
            <button
              onClick={onResolve}
              className="px-3 py-1 text-xs rounded bg-green-ok/20 text-green-ok hover:bg-green-ok/30 transition-colors"
            >
              解决
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

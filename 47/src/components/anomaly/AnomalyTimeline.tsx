import { useEffect } from 'react'
import { useAnomalyStore } from '../../store/useAnomalyStore'
import type { AnomalyEvent } from '../../../shared/types'

const levelColors: Record<string, string> = {
  warning: 'bg-warning',
  critical: 'bg-critical',
  fault: 'bg-fault',
}

const levelLabels: Record<string, string> = {
  warning: '警告',
  critical: '严重',
  fault: '故障',
}

const levelBorders: Record<string, string> = {
  warning: 'border-warning/30',
  critical: 'border-critical/30',
  fault: 'border-fault/30',
}

export default function AnomalyTimeline() {
  const events = useAnomalyStore((s) => s.events)
  const filter = useAnomalyStore((s) => s.filter)
  const selectedEvent = useAnomalyStore((s) => s.selectedEvent)
  const setFilter = useAnomalyStore((s) => s.setFilter)
  const selectEvent = useAnomalyStore((s) => s.selectEvent)
  const fetchEvents = useAnomalyStore((s) => s.fetchEvents)

  useEffect(() => {
    fetchEvents()
  }, [filter, fetchEvents])

  const levels = ['all', 'warning', 'critical', 'fault'] as const

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-4 h-full flex flex-col">
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-sm font-semibold text-text-primary mr-auto">异常事件</h3>
        {levels.map((lv) => (
          <button
            key={lv}
            onClick={() => setFilter({ level: lv === 'all' ? undefined : lv })}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${
              (lv === 'all' ? !filter.level : filter.level === lv)
                ? 'bg-accent/10 border-accent/40 text-accent'
                : 'border-border-default text-text-secondary hover:text-text-primary'
            }`}
          >
            {lv === 'all' ? '全部' : levelLabels[lv]}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto space-y-2">
        {events.map((event: AnomalyEvent) => (
          <button
            key={event.id}
            onClick={() => selectEvent(event)}
            className={`w-full text-left p-3 rounded-lg border transition-colors ${
              selectedEvent?.id === event.id
                ? 'border-accent/50 bg-accent/5'
                : `border-border-default hover:border-accent/30 ${levelBorders[event.level]}`
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className={`w-2 h-2 rounded-full ${levelColors[event.level]}`} />
              <span className="text-xs text-text-secondary">
                {new Date(event.timestamp).toLocaleString('zh-CN', { hour12: false })}
              </span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ml-auto ${
                  event.level === 'warning'
                    ? 'bg-warning/10 text-warning'
                    : event.level === 'critical'
                    ? 'bg-critical/10 text-critical'
                    : 'bg-fault/10 text-fault'
                }`}
              >
                {levelLabels[event.level]}
              </span>
            </div>
            <div className="text-xs text-text-primary font-medium">
              {event.arrayId} · {event.type}
            </div>
            <div className="text-[11px] text-text-secondary mt-0.5 line-clamp-2">
              {event.description}
            </div>
          </button>
        ))}
        {events.length === 0 && (
          <div className="text-center text-text-secondary text-xs py-12">暂无异常事件</div>
        )}
      </div>
    </div>
  )
}

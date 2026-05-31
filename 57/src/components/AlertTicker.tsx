import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Alert } from '../../shared/types'
import { ALERT_LEVEL_CONFIG, METRIC_LABELS, METRIC_UNITS } from '../../shared/types'

interface AlertTickerProps {
  alerts: Alert[]
}

export default function AlertTicker({ alerts }: AlertTickerProps) {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [isPaused, setIsPaused] = useState(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let animId: number
    const step = () => {
      if (!isPaused) {
        el.scrollLeft += 0.5
        if (el.scrollLeft >= el.scrollWidth - el.clientWidth) {
          el.scrollLeft = 0
        }
      }
      animId = requestAnimationFrame(step)
    }
    animId = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animId)
  }, [isPaused])

  if (alerts.length === 0) return null

  return (
    <div className="card p-0 overflow-hidden animate-fade-in">
      <div className="flex items-center h-10">
        <div className="shrink-0 px-3 bg-alert-red/20 text-alert-red text-xs font-semibold flex items-center gap-1.5 h-full border-r border-primary-light/20">
          <span className="w-1.5 h-1.5 rounded-full bg-alert-red animate-pulse" />
          预警
        </div>
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden flex items-center h-full"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div className="flex items-center gap-6 px-4 whitespace-nowrap">
            {[...alerts, ...alerts].map((alert, i) => {
              const config = ALERT_LEVEL_CONFIG[alert.level]
              return (
                <button
                  key={`${alert.id}-${i}`}
                  className="flex items-center gap-2 text-xs hover:bg-primary-light/30 px-2 py-1 rounded transition-colors"
                  onClick={() => navigate('/anomaly')}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: config.color }}
                  />
                  <span className="text-gray-300">{alert.stationName}</span>
                  <span style={{ color: config.color }}>
                    {METRIC_LABELS[alert.metric] || alert.metric}
                  </span>
                  <span className="font-mono text-gray-400">
                    {alert.value}{METRIC_UNITS[alert.metric] || ''}
                  </span>
                  <span className="text-gray-500">
                    {new Date(alert.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

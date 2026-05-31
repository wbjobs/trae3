import { useState, useEffect, useRef } from 'react'
import { Bell, X } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { AlarmRecord } from '../../../shared/types'

const LEVEL_BORDER: Record<string, string> = {
  critical: 'border-l-pipeline-alarm',
  warning: 'border-l-pipeline-warn',
  info: 'border-l-pipeline-cyan',
}

const LEVEL_BG: Record<string, string> = {
  critical: 'bg-pipeline-alarm/10',
  warning: 'bg-pipeline-warn/10',
  info: 'bg-pipeline-cyan/10',
}

interface AlarmBarProps {
  onAlarmClick?: (alarm: AlarmRecord) => void
}

export default function AlarmBar({ onAlarmClick }: AlarmBarProps) {
  const alarms = usePipelineStore((s) => s.alarms)
  const [currentIndex, setCurrentIndex] = useState(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const unacknowledged = alarms.filter((a) => !a.acknowledged)

  useEffect(() => {
    if (unacknowledged.length <= 1) return
    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % unacknowledged.length)
    }, 5000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [unacknowledged.length])

  if (unacknowledged.length === 0) {
    return (
      <div className="h-full flex items-center px-4">
        <Bell size={14} className="text-pipeline-ok mr-2" />
        <span className="text-[10px] text-[#7a8fa6]">系统运行正常，无未处理告警</span>
      </div>
    )
  }

  const alarm = unacknowledged[currentIndex % unacknowledged.length]

  return (
    <div className="h-full flex items-center px-4 gap-3">
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Bell size={14} className="text-pipeline-alarm animate-pulse-alarm" />
        <span className="text-[10px] font-medium text-pipeline-alarm bg-pipeline-alarm/10 px-1.5 py-0.5 rounded">
          {unacknowledged.length}
        </span>
      </div>

      <div
        className={`flex-1 flex items-center gap-3 px-3 py-1 rounded border-l-2 ${LEVEL_BORDER[alarm.level]} ${LEVEL_BG[alarm.level]} cursor-pointer hover:opacity-80 transition-opacity overflow-hidden`}
        onClick={() => onAlarmClick?.(alarm)}
      >
        <span className="text-[10px] font-medium text-pipeline-alarm flex-shrink-0">
          [{alarm.level === 'critical' ? '严重' : alarm.level === 'warning' ? '警告' : '提示'}]
        </span>
        <span className="text-[10px] text-[#e0e8f0] truncate">
          {alarm.message}
        </span>
        <span className="text-[10px] text-[#4a6a8a] flex-shrink-0 ml-auto">
          {new Date(alarm.timestamp).toLocaleTimeString('zh-CN')}
        </span>
      </div>

      <span className="text-[10px] text-[#4a6a8a] flex-shrink-0">
        {currentIndex + 1}/{unacknowledged.length}
      </span>
    </div>
  )
}

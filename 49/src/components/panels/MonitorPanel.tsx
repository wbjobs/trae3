import { useMemo } from 'react'
import { CheckCircle, AlertTriangle, AlertOctagon, Bell } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { AlarmRecord } from '../../../shared/types'

interface MonitorPanelProps {
  onAlarmClick?: (alarm: AlarmRecord) => void
}

const LEVEL_COLORS: Record<string, string> = {
  critical: 'text-pipeline-alarm',
  warning: 'text-pipeline-warn',
  info: 'text-pipeline-cyan',
}

export default function MonitorPanel({ onAlarmClick }: MonitorPanelProps) {
  const pipes = usePipelineStore((s) => s.pipes)
  const alarms = usePipelineStore((s) => s.alarms)
  const acknowledgeAlarm = usePipelineStore((s) => s.acknowledgeAlarm)
  const currentUser = usePipelineStore((s) => s.currentUser)

  const stats = useMemo(() => {
    const normal = pipes.filter((p) => p.status === 'normal').length
    const warning = pipes.filter((p) => p.status === 'warning').length
    const alarm = pipes.filter((p) => p.status === 'alarm').length
    return { total: pipes.length, normal, warning, alarm }
  }, [pipes])

  const unacknowledged = alarms.filter((a) => !a.acknowledged).slice(0, 10)

  const areaHealth = useMemo(() => {
    const areaMap = new Map<string, { total: number; normal: number }>()
    for (const pipe of pipes) {
      const entry = areaMap.get(pipe.areaId) ?? { total: 0, normal: 0 }
      entry.total++
      if (pipe.status === 'normal') entry.normal++
      areaMap.set(pipe.areaId, entry)
    }
    return Array.from(areaMap.entries()).map(([area, data]) => ({
      area,
      ...data,
      ratio: data.total > 0 ? data.normal / data.total : 0,
    }))
  }, [pipes])

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <h3 className="text-xs font-medium text-[#e0e8f0]">实时监控</h3>
      </div>

      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <h4 className="text-[10px] text-[#7a8fa6] mb-2">管段统计</h4>
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-1.5 rounded bg-[#0a1628]/60">
            <div className="text-sm font-mono font-bold text-[#e0e8f0]">{stats.total}</div>
            <div className="text-[8px] text-[#7a8fa6]">总数</div>
          </div>
          <div className="text-center p-1.5 rounded bg-pipeline-ok/10">
            <div className="text-sm font-mono font-bold text-pipeline-ok">{stats.normal}</div>
            <div className="text-[8px] text-pipeline-ok/70">正常</div>
          </div>
          <div className="text-center p-1.5 rounded bg-pipeline-warn/10">
            <div className="text-sm font-mono font-bold text-pipeline-warn">{stats.warning}</div>
            <div className="text-[8px] text-pipeline-warn/70">预警</div>
          </div>
          <div className="text-center p-1.5 rounded bg-pipeline-alarm/10">
            <div className="text-sm font-mono font-bold text-pipeline-alarm">{stats.alarm}</div>
            <div className="text-[8px] text-pipeline-alarm/70">告警</div>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <h4 className="text-[10px] text-[#7a8fa6] mb-2">区域健康度</h4>
        <div className="space-y-1.5">
          {areaHealth.map(({ area, total, ratio }) => (
            <div key={area}>
              <div className="flex justify-between text-[9px] mb-0.5">
                <span className="text-[#b0c4d8]">{area}</span>
                <span className="text-[#4a6a8a]">{total}管段</span>
              </div>
              <div className="h-1.5 bg-[#1a3a5c]/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${ratio * 100}%`,
                    backgroundColor: ratio > 0.8 ? '#4caf50' : ratio > 0.5 ? '#ffa726' : '#ff3d00',
                  }}
                />
              </div>
            </div>
          ))}
          {areaHealth.length === 0 && (
            <span className="text-[9px] text-[#4a6a8a]">暂无数据</span>
          )}
        </div>
      </div>

      <div className="px-3 py-2 flex-1">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] text-[#7a8fa6]">最近告警</h4>
          <span className="text-[9px] text-[#4a6a8a]">{unacknowledged.length}条未处理</span>
        </div>
        <div className="space-y-1">
          {unacknowledged.map((alarm) => (
            <div
              key={alarm.id}
              className="flex items-center gap-2 p-1.5 rounded bg-[#0a1628]/60 border border-[#1a3a5c]/30 cursor-pointer hover:border-[#1a3a5c]/60 transition-colors"
              onClick={() => onAlarmClick?.(alarm)}
            >
              <span className={`flex-shrink-0 ${LEVEL_COLORS[alarm.level]}`}>
                {alarm.level === 'critical' ? <AlertOctagon size={12} /> : alarm.level === 'warning' ? <AlertTriangle size={12} /> : <Bell size={12} />}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[9px] text-[#e0e8f0] truncate">{alarm.message}</div>
                <div className="text-[8px] text-[#4a6a8a]">{new Date(alarm.timestamp).toLocaleTimeString('zh-CN')}</div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  acknowledgeAlarm(alarm.id, currentUser?.id ?? '')
                }}
                className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded hover:bg-pipeline-ok/20 text-[#4a6a8a] hover:text-pipeline-ok transition-colors cursor-pointer"
                title="确认告警"
              >
                <CheckCircle size={10} />
              </button>
            </div>
          ))}
          {unacknowledged.length === 0 && (
            <div className="text-center text-[9px] text-[#4a6a8a] py-2">无未处理告警</div>
          )}
        </div>
      </div>
    </div>
  )
}

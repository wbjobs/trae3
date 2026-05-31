import { X, CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { AlarmRecord } from '../../../shared/types'

const LEVEL_CONFIG: Record<string, { label: string; icon: typeof AlertOctagon; color: string; borderColor: string }> = {
  critical: { label: '严重', icon: AlertOctagon, color: 'text-pipeline-alarm', borderColor: 'border-pipeline-alarm' },
  warning: { label: '警告', icon: AlertTriangle, color: 'text-pipeline-warn', borderColor: 'border-pipeline-warn' },
  info: { label: '提示', icon: AlertOctagon, color: 'text-pipeline-cyan', borderColor: 'border-pipeline-cyan' },
}

const TYPE_LABELS: Record<string, string> = {
  pressure_high: '压力过高',
  pressure_low: '压力过低',
  flow_abnormal: '流量异常',
  temperature_high: '温度过高',
}

interface AlarmDetailModalProps {
  alarm: AlarmRecord | null
  onClose: () => void
}

export default function AlarmDetailModal({ alarm, onClose }: AlarmDetailModalProps) {
  const acknowledgeAlarm = usePipelineStore((s) => s.acknowledgeAlarm)
  const currentUser = usePipelineStore((s) => s.currentUser)
  const pipes = usePipelineStore((s) => s.pipes)

  if (!alarm) return null

  const config = LEVEL_CONFIG[alarm.level] ?? LEVEL_CONFIG.info
  const Icon = config.icon
  const pipeName = pipes.find((p) => p.id === alarm.pipeId)?.name ?? alarm.pipeId

  const handleAcknowledge = () => {
    acknowledgeAlarm(alarm.id, currentUser?.id ?? '')
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-[360px] glass-panel-solid p-0 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center gap-2 px-4 py-3 border-b border-[#1a3a5c]/50 ${config.borderColor} border-l-4`}>
          <Icon size={16} className={config.color} />
          <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
          <button
            onClick={onClose}
            className="ml-auto w-6 h-6 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[10px]">
            <span className="text-[#7a8fa6]">告警类型</span>
            <span className="text-[#e0e8f0]">{TYPE_LABELS[alarm.type] ?? alarm.type}</span>
            <span className="text-[#7a8fa6]">告警级别</span>
            <span className={config.color}>{config.label}</span>
            <span className="text-[#7a8fa6]">管段名称</span>
            <span className="text-[#e0e8f0]">{pipeName}</span>
            <span className="text-[#7a8fa6]">当前值</span>
            <span className="text-[#e0e8f0] font-mono">{alarm.value}</span>
            <span className="text-[#7a8fa6]">阈值</span>
            <span className="text-[#e0e8f0] font-mono">{alarm.threshold}</span>
            <span className="text-[#7a8fa6]">时间</span>
            <span className="text-[#e0e8f0]">{new Date(alarm.timestamp).toLocaleString('zh-CN')}</span>
          </div>

          <div className="p-2 rounded bg-[#0a1628]/60 border border-[#1a3a5c]/30">
            <span className="text-[10px] text-[#7a8fa6]">告警信息</span>
            <p className="text-[10px] text-[#e0e8f0] mt-1">{alarm.message}</p>
          </div>
        </div>

        <div className="px-4 py-3 flex gap-2 border-t border-[#1a3a5c]/50">
          <button
            onClick={onClose}
            className="flex-1 h-7 text-[10px] text-[#7a8fa6] bg-[#1a3a5c]/30 rounded hover:bg-[#1a3a5c]/50 transition-colors cursor-pointer"
          >
            关闭
          </button>
          {!alarm.acknowledged && (
            <button
              onClick={handleAcknowledge}
              className="flex-1 h-7 flex items-center justify-center gap-1 text-[10px] text-pipeline-ok bg-pipeline-ok/10 rounded hover:bg-pipeline-ok/20 transition-colors cursor-pointer"
            >
              <CheckCircle size={12} />
              确认告警
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

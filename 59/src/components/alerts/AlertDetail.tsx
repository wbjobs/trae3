import { useState } from 'react'
import type { Alert } from '../../../shared/types'
import { useNavigate } from 'react-router-dom'
import { X, MapPin, CheckCircle2, MessageSquare } from 'lucide-react'

interface AlertDetailProps {
  alert: Alert | null
  onClose: () => void
  onConfirm: (id: string, confirmedBy: string) => void
  onResolve: (id: string, remark: string) => void
}

const levelLabels: Record<Alert['level'], { text: string; color: string; bg: string }> = {
  critical: { text: '严重', color: 'text-red-alert', bg: 'bg-red-alert/15' },
  major: { text: '重要', color: 'text-amber-warn', bg: 'bg-amber-warn/15' },
  minor: { text: '一般', color: 'text-yellow-400', bg: 'bg-yellow-400/15' },
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString('zh-CN')
}

export default function AlertDetail({ alert, onClose, onConfirm, onResolve }: AlertDetailProps) {
  const [confirmer, setConfirmer] = useState('')
  const [remark, setRemark] = useState('')
  const navigate = useNavigate()

  if (!alert) {
    return (
      <div className="fixed right-0 top-0 h-full w-[420px] translate-x-full transition-transform duration-300" />
    )
  }

  const lv = levelLabels[alert.level]

  return (
    <div className="fixed right-0 top-0 h-full w-[420px] bg-deep-blue/95 border-l border-neon-cyan/10 backdrop-blur-md animate-slide-in z-50 flex flex-col">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/50">
        <h3 className="text-lg font-display font-bold text-slate-100">告警详情</h3>
        <button onClick={onClose} className="p-1.5 rounded hover:bg-steel-gray text-slate-400 hover:text-slate-200 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div>
          <span className={`inline-block px-2.5 py-1 rounded text-xs font-bold ${lv.bg} ${lv.color}`}>
            {lv.text}
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <p className="text-xs text-slate-500 mb-0.5">设备名称</p>
            <p className="text-sm text-slate-200">{alert.deviceName}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">告警信息</p>
            <p className="text-sm text-slate-200">{alert.message}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">参数</p>
              <p className="text-sm text-slate-200 font-mono">{alert.paramKey}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">当前值</p>
              <p className="text-sm text-red-alert font-mono">{alert.paramValue}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">阈值</p>
              <p className="text-sm text-slate-300 font-mono">{alert.threshold}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500 mb-0.5">状态</p>
              <p className="text-sm text-slate-200">{alert.status === 'active' ? '活跃' : alert.status === 'confirmed' ? '已确认' : '已解决'}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-slate-500 mb-0.5">触发时间</p>
            <p className="text-sm text-slate-300">{formatTime(alert.createdAt)}</p>
          </div>
          {alert.confirmedAt && (
            <div>
              <p className="text-xs text-slate-500 mb-0.5">确认时间</p>
              <p className="text-sm text-slate-300">{formatTime(alert.confirmedAt)}</p>
            </div>
          )}
          {alert.confirmedBy && (
            <div>
              <p className="text-xs text-slate-500 mb-0.5">确认人</p>
              <p className="text-sm text-slate-300">{alert.confirmedBy}</p>
            </div>
          )}
          {alert.remark && (
            <div>
              <p className="text-xs text-slate-500 mb-0.5">备注</p>
              <p className="text-sm text-slate-300">{alert.remark}</p>
            </div>
          )}
        </div>

        <div className="pt-2 space-y-4">
          <button
            onClick={() => navigate('/', { state: { deviceId: alert.deviceId } })}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan hover:bg-neon-cyan/20 transition-colors text-sm font-body"
          >
            <MapPin className="w-4 h-4" />
            3D 定位
          </button>

          {alert.status === 'active' && (
            <div className="space-y-2">
              <input
                type="text"
                value={confirmer}
                onChange={(e) => setConfirmer(e.target.value)}
                placeholder="确认人姓名"
                className="w-full px-3 py-2 rounded bg-steel-gray border border-slate-600 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-neon-cyan/50"
              />
              <button
                onClick={() => { if (confirmer.trim()) { onConfirm(alert.id, confirmer.trim()); setConfirmer('') } }}
                disabled={!confirmer.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-amber-warn/15 border border-amber-warn/30 text-amber-warn hover:bg-amber-warn/25 transition-colors text-sm font-body disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <CheckCircle2 className="w-4 h-4" />
                确认告警
              </button>
            </div>
          )}

          {alert.status === 'confirmed' && (
            <div className="space-y-2">
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                placeholder="解决备注"
                rows={3}
                className="w-full px-3 py-2 rounded bg-steel-gray border border-slate-600 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-neon-cyan/50 resize-none"
              />
              <button
                onClick={() => { if (remark.trim()) { onResolve(alert.id, remark.trim()); setRemark('') } }}
                disabled={!remark.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded bg-green-ok/15 border border-green-ok/30 text-green-ok hover:bg-green-ok/25 transition-colors text-sm font-body disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <MessageSquare className="w-4 h-4" />
                解决告警
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

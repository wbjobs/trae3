import { useState, useEffect, useMemo } from 'react'
import { X, Activity, Droplets, Thermometer, MessageSquarePlus, Crosshair } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { usePipelineStore } from '@/store/usePipelineStore'
import { useApi } from '@/hooks/useApi'
import type { RealtimeData } from '../../../shared/types'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  normal: { label: '正常', color: 'text-pipeline-ok', bg: 'bg-pipeline-ok/10' },
  warning: { label: '预警', color: 'text-pipeline-warn', bg: 'bg-pipeline-warn/10' },
  alarm: { label: '告警', color: 'text-pipeline-alarm', bg: 'bg-pipeline-alarm/10' },
}

const STATUS_COLOR_HEX: Record<string, string> = {
  normal: '#4caf50',
  warning: '#ffa726',
  alarm: '#ff3d00',
}

interface PipeDetailPanelProps {
  onAddAnnotation?: () => void
}

export default function PipeDetailPanel({ onAddAnnotation }: PipeDetailPanelProps) {
  const pipes = usePipelineStore((s) => s.pipes)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const realtimeData = usePipelineStore((s) => s.realtimeData)
  const selectPipe = usePipelineStore((s) => s.selectPipe)
  const toggleCrossSection = usePipelineStore((s) => s.toggleCrossSection)
  const showCrossSection = usePipelineStore((s) => s.showCrossSection)
  const api = useApi()

  const [timeRange, setTimeRange] = useState<'24h' | '7d'>('24h')
  const [historyData, setHistoryData] = useState<RealtimeData[]>([])

  const pipe = useMemo(
    () => pipes.find((p) => p.id === selectedPipeId),
    [pipes, selectedPipeId]
  )

  const rt = selectedPipeId ? realtimeData.get(selectedPipeId) : undefined
  const status = rt?.status ?? pipe?.status ?? 'normal'
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.normal

  useEffect(() => {
    if (!selectedPipeId) return
    api.fetchPipeHistory(selectedPipeId, timeRange).then(setHistoryData).catch(() => {})
  }, [selectedPipeId, timeRange, api])

  const chartData = useMemo(
    () =>
      historyData.map((d) => ({
        time: new Date(d.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
        pressure: d.pressure,
        flow: d.flow,
      })),
    [historyData]
  )

  if (!pipe) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[#4a6a8a] text-xs gap-2">
        <Activity size={24} className="opacity-40" />
        <span>选择管段查看详情</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a3a5c]/50">
        <h3 className="text-xs font-medium text-[#e0e8f0] truncate">{pipe.name}</h3>
        <button
          onClick={() => selectPipe(null)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2 space-y-2">
        <div className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-medium ${statusCfg.color} ${statusCfg.bg}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${status === 'normal' ? 'bg-pipeline-ok' : status === 'warning' ? 'bg-pipeline-warn' : 'bg-pipeline-alarm'}`} />
          {statusCfg.label}
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
          <span className="text-[#7a8fa6]">区域</span>
          <span className="text-[#e0e8f0]">{pipe.areaId}</span>
          <span className="text-[#7a8fa6]">材质</span>
          <span className="text-[#e0e8f0]">{pipe.material}</span>
          <span className="text-[#7a8fa6]">管径</span>
          <span className="text-[#e0e8f0]">{pipe.diameter}mm</span>
          <span className="text-[#7a8fa6]">长度</span>
          <span className="text-[#e0e8f0]">{pipe.length}m</span>
          <span className="text-[#7a8fa6]">安装日期</span>
          <span className="text-[#e0e8f0]">{pipe.installDate}</span>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-[#1a3a5c]/50 space-y-2">
        <h4 className="text-[10px] font-medium text-[#7a8fa6]">实时数据</h4>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Droplets size={12} className="text-pipeline-cyan" />
            <span className="text-[10px] text-[#7a8fa6] w-8">压力</span>
            <span className={`text-xs font-mono font-medium flex-1 ${rt?.status === 'alarm' ? 'text-pipeline-alarm' : rt?.status === 'warning' ? 'text-pipeline-warn' : 'text-pipeline-ok'}`}>
              {rt?.pressure.toFixed(2) ?? '--'} MPa
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Activity size={12} className="text-pipeline-cyan" />
            <span className="text-[10px] text-[#7a8fa6] w-8">流量</span>
            <span className={`text-xs font-mono font-medium flex-1 ${rt?.status === 'alarm' ? 'text-pipeline-alarm' : rt?.status === 'warning' ? 'text-pipeline-warn' : 'text-pipeline-ok'}`}>
              {rt?.flow.toFixed(1) ?? '--'} m³/h
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Thermometer size={12} className="text-pipeline-cyan" />
            <span className="text-[10px] text-[#7a8fa6] w-8">温度</span>
            <span className="text-xs font-mono font-medium flex-1 text-[#e0e8f0]">
              {rt?.temperature.toFixed(1) ?? '--'} °C
            </span>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-[#1a3a5c]/50 flex-1">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-[10px] font-medium text-[#7a8fa6]">历史趋势</h4>
          <div className="flex gap-1">
            {(['24h', '7d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={`px-2 py-0.5 text-[10px] rounded cursor-pointer transition-colors ${
                  timeRange === r
                    ? 'bg-pipeline-cyan/20 text-pipeline-cyan'
                    : 'text-[#7a8fa6] hover:text-[#b0c4d8]'
                }`}
              >
                {r === '24h' ? '24小时' : '7天'}
              </button>
            ))}
          </div>
        </div>

        <div className="h-[120px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <XAxis dataKey="time" tick={{ fontSize: 9, fill: '#4a6a8a' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#4a6a8a' }} axisLine={false} tickLine={false} width={35} />
              <Tooltip
                contentStyle={{ background: '#0a1628', border: '1px solid #1a3a5c', borderRadius: 4, fontSize: 10 }}
                labelStyle={{ color: '#7a8fa6' }}
              />
              <Line type="monotone" dataKey="pressure" stroke="#00e5ff" dot={false} strokeWidth={1.5} />
              <Line type="monotone" dataKey="flow" stroke="#ffa726" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="px-3 py-2 border-t border-[#1a3a5c]/50 space-y-2">
        <button
          onClick={toggleCrossSection}
          className={`w-full h-7 flex items-center justify-center gap-1.5 text-[10px] rounded transition-colors cursor-pointer ${
            showCrossSection
              ? 'text-pipeline-cyan bg-pipeline-cyan/20'
              : 'text-pipeline-cyan bg-pipeline-cyan/10 hover:bg-pipeline-cyan/20'
          }`}
        >
          <Crosshair size={12} />
          {showCrossSection ? '关闭剖面图' : '查看剖面图'}
        </button>
        <button
          onClick={onAddAnnotation}
          className="w-full h-7 flex items-center justify-center gap-1.5 text-[10px] text-pipeline-cyan bg-pipeline-cyan/10 rounded hover:bg-pipeline-cyan/20 transition-colors cursor-pointer"
        >
          <MessageSquarePlus size={12} />
          添加标注
        </button>
      </div>
    </div>
  )
}

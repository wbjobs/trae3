import { useMemo } from 'react'
import { X, AlertTriangle, Shield, Clock, Wrench } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { CrossSectionData } from '../../../shared/types'

const RISK_CONFIG = {
  low: { label: '低风险', color: 'text-pipeline-ok', bg: 'bg-pipeline-ok/10', bar: 'bg-pipeline-ok' },
  medium: { label: '中风险', color: 'text-pipeline-warn', bg: 'bg-pipeline-warn/10', bar: 'bg-pipeline-warn' },
  high: { label: '高风险', color: 'text-pipeline-alarm', bg: 'bg-pipeline-alarm/10', bar: 'bg-pipeline-alarm' },
}

const SEVERITY_COLORS: Record<string, string> = {
  mild: '#fdd835',
  moderate: '#ffa726',
  severe: '#ff3d00',
}

function polarToCart(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(cx: number, cy: number, startAngle: number, endAngle: number, innerR: number, outerR: number) {
  const p1 = polarToCart(cx, cy, outerR, startAngle)
  const p2 = polarToCart(cx, cy, outerR, endAngle)
  const p3 = polarToCart(cx, cy, innerR, endAngle)
  const p4 = polarToCart(cx, cy, innerR, startAngle)
  const largeArc = (endAngle - startAngle + 360) % 360 > 180 ? 1 : 0
  return `M ${p1.x} ${p1.y} A ${outerR} ${outerR} 0 ${largeArc} 1 ${p2.x} ${p2.y} L ${p3.x} ${p3.y} A ${innerR} ${innerR} 0 ${largeArc} 0 ${p4.x} ${p4.y} Z`
}

function pressureColor(value: number): string {
  if (value < 0.7) return '#4caf50'
  if (value < 0.9) return '#fdd835'
  return '#ff3d00'
}

export default function CrossSectionPanel() {
  const crossSectionData = usePipelineStore((s) => s.crossSectionData)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const pipes = usePipelineStore((s) => s.pipes)
  const setShowCrossSection = usePipelineStore((s) => s.setShowCrossSection)

  const selectedPipe = useMemo(
    () => pipes.find((p) => p.id === selectedPipeId),
    [pipes, selectedPipeId]
  )

  if (!crossSectionData || !selectedPipe) {
    return null
  }

  const riskCfg = RISK_CONFIG[crossSectionData.riskLevel]
  const data = crossSectionData

  const cx = 100
  const cy = 100
  const outerR = 85
  const wallWidth = Math.max(8, Math.min(20, data.wallThickness))
  const innerR = outerR - wallWidth

  const lifePercent = Math.min(100, Math.max(0, (data.estimatedLife / 30) * 100))

  const maxPressure = Math.max(...data.pressureDistribution.map((p) => p.value))
  const pressureBarMax = 25

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a3a5c]/50">
        <h3 className="text-xs font-medium text-[#e0e8f0]">剖面分析 - {selectedPipe.name}</h3>
        <button
          onClick={() => setShowCrossSection(false)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-medium ${riskCfg.color} ${riskCfg.bg}`}>
          <AlertTriangle size={10} />
          {riskCfg.label}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <h4 className="text-[10px] font-medium text-[#7a8fa6] mb-2">管壁截面</h4>
        <svg viewBox="0 0 200 200" className="w-full h-auto">
          <defs>
            <radialGradient id="cs-outer" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#3a4a5c" />
              <stop offset="100%" stopColor="#2a3a4c" />
            </radialGradient>
            <radialGradient id="cs-inner" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#0d1a2d" />
              <stop offset="100%" stopColor="#060e1a" />
            </radialGradient>
          </defs>

          <circle cx={cx} cy={cy} r={outerR} fill="url(#cs-outer)" stroke="#4a6a8a" strokeWidth="1.5" />
          <circle cx={cx} cy={cy} r={innerR} fill="url(#cs-inner)" stroke="#1a3a5c" strokeWidth="1" />

          {data.corrosionLayers.map((layer) => {
            const color = SEVERITY_COLORS[layer.severity] || '#ffa726'
            const depthR = outerR - (layer.depth / data.wallThickness) * wallWidth
            return (
              <path
                key={layer.id}
                d={describeArc(cx, cy, layer.startAngle, layer.endAngle, depthR, outerR)}
                fill={color}
                fillOpacity="0.7"
                stroke={color}
                strokeWidth="1"
                className="animate-corrosion-pulse"
              />
            )
          })}

          {data.pressureDistribution.map((point, i) => {
            const barLen = (point.value / maxPressure) * pressureBarMax
            const p1 = polarToCart(cx, cy, innerR - 2, point.angle)
            const p2 = polarToCart(cx, cy, innerR - 2 - barLen, point.angle)
            return (
              <line
                key={i}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke={pressureColor(point.value)}
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.85"
              />
            )
          })}

          <text x={cx} y={cy - 6} textAnchor="middle" fill="#7a8fa6" fontSize="7">{data.diameter}mm</text>
          <text x={cx} y={cy + 4} textAnchor="middle" fill="#00e5ff" fontSize="9" fontWeight="bold">{data.wallThickness}mm</text>
          <text x={cx} y={cy + 14} textAnchor="middle" fill="#4a6a8a" fontSize="6">{data.material}</text>
        </svg>
      </div>

      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <h4 className="text-[10px] font-medium text-[#7a8fa6] mb-1">管径信息</h4>
        <div className="grid grid-cols-3 gap-2 text-[10px]">
          <div className="bg-[#1a3a5c]/30 rounded p-1.5 text-center">
            <div className="text-[#7a8fa6]">直径</div>
            <div className="text-[#e0e8f0] font-mono">{data.diameter}mm</div>
          </div>
          <div className="bg-[#1a3a5c]/30 rounded p-1.5 text-center">
            <div className="text-[#7a8fa6]">壁厚</div>
            <div className="text-[#e0e8f0] font-mono">{data.wallThickness}mm</div>
          </div>
          <div className="bg-[#1a3a5c]/30 rounded p-1.5 text-center">
            <div className="text-[#7a8fa6]">材质</div>
            <div className="text-[#e0e8f0]">{data.material}</div>
          </div>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <div className="flex items-center gap-1.5 mb-2">
          <Clock size={10} className="text-[#7a8fa6]" />
          <h4 className="text-[10px] font-medium text-[#7a8fa6]">剩余寿命预估</h4>
        </div>
        <div className="relative h-4 bg-[#1a3a5c]/30 rounded-full overflow-hidden">
          <div
            className={`absolute left-0 top-0 h-full ${riskCfg.bar} rounded-full transition-all duration-500`}
            style={{ width: `${lifePercent}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[9px]">
          <span className="text-[#7a8fa6]">0年</span>
          <span className={`font-mono font-medium ${riskCfg.color}`}>{data.estimatedLife}年</span>
          <span className="text-[#7a8fa6]">30年</span>
        </div>
      </div>

      <div className="px-3 py-2 flex-1">
        <div className="flex items-center gap-1.5 mb-2">
          <Wrench size={10} className="text-[#7a8fa6]" />
          <h4 className="text-[10px] font-medium text-[#7a8fa6]">维护建议</h4>
        </div>
        <ul className="space-y-1.5">
          {data.maintenanceRecommendations.map((rec, i) => (
            <li key={i} className="flex items-start gap-2 text-[10px] text-[#b0c4d8]">
              <Shield size={10} className="text-pipeline-cyan mt-0.5 flex-shrink-0" />
              <span>{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

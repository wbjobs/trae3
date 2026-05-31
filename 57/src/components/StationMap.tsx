import { useState } from 'react'
import type { Station } from '../../shared/types'
import { METRIC_LABELS, METRIC_UNITS } from '../../shared/types'

interface StationMapProps {
  stations: Station[]
  onSelectStation: (id: string) => void
  selectedStationId?: string | null
}

const statusColors: Record<string, string> = {
  online: '#00D4AA',
  warning: '#F59E0B',
  offline: '#6B7280',
}

const riverPath = 'M 60,40 C 120,80 180,120 260,100 C 340,80 400,140 480,160 C 540,175 600,190 700,210'
const tributary1 = 'M 140,20 C 160,50 200,70 260,100'
const tributary2 = 'M 420,50 C 440,80 460,110 480,160'
const tributary3 = 'M 580,130 C 600,150 640,170 700,210'

interface TooltipData {
  station: Station
  x: number
  y: number
}

export default function StationMap({ stations, onSelectStation, selectedStationId }: StationMapProps) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)

  const stationPositions = stations.map((s, i) => {
    const t = (i + 0.5) / stations.length
    const x = 60 + t * 640
    const y = 40 + t * 170 + Math.sin(t * Math.PI * 2) * 20
    return { station: s, x, y }
  })

  return (
    <div className="card-hover p-4 animate-slide-up" style={{ animationDelay: '200ms' }}>
      <h3 className="text-sm font-semibold text-gray-300 mb-3">流域站点分布</h3>
      <div className="relative">
        <svg viewBox="0 0 760 260" className="w-full h-auto">
          <defs>
            <linearGradient id="riverGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1E6091" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#2563EB" stopOpacity="0.8" />
            </linearGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            d={riverPath}
            fill="none"
            stroke="url(#riverGrad)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            d={tributary1}
            fill="none"
            stroke="#1E6091"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d={tributary2}
            fill="none"
            stroke="#1E6091"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d={tributary3}
            fill="none"
            stroke="#1E6091"
            strokeWidth="2.5"
            strokeLinecap="round"
            opacity="0.5"
          />

          <text x="380" y="250" textAnchor="middle" className="text-[10px]" fill="#4B6A8A">
            主河道流域示意图
          </text>

          {stationPositions.map(({ station, x, y }) => {
            const isSelected = station.id === selectedStationId
            const color = statusColors[station.status] || statusColors.offline
            const hasAlert = station.status === 'warning'

            return (
              <g
                key={station.id}
                className="cursor-pointer"
                onClick={() => onSelectStation(station.id)}
                onMouseEnter={() => setTooltip({ station, x, y })}
                onMouseLeave={() => setTooltip(null)}
              >
                {hasAlert && (
                  <circle cx={x} cy={y} r="12" fill={color} opacity="0.2">
                    <animate
                      attributeName="r"
                      values="10;16;10"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      values="0.3;0.1;0.3"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}
                <circle
                  cx={x}
                  cy={y}
                  r={isSelected ? 7 : 5}
                  fill={color}
                  stroke={isSelected ? '#fff' : 'transparent'}
                  strokeWidth={isSelected ? 2 : 0}
                  filter="url(#glow)"
                />
                <text
                  x={x}
                  y={y - 12}
                  textAnchor="middle"
                  className="text-[9px]"
                  fill="#94A3B8"
                >
                  {station.name}
                </text>
              </g>
            )
          })}
        </svg>

        {tooltip && (
          <div
            className="absolute pointer-events-none bg-primary-dark/95 border border-primary-light/40 rounded-lg px-3 py-2 text-xs shadow-xl z-10"
            style={{
              left: `${(tooltip.x / 760) * 100}%`,
              top: `${(tooltip.y / 260) * 100 - 15}%`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className="font-semibold text-white mb-1">{tooltip.station.name}</div>
            <div className="text-gray-400">
              {tooltip.station.river} · 状态:{' '}
              <span style={{ color: statusColors[tooltip.station.status] }}>
                {tooltip.station.status === 'online' ? '在线' : tooltip.station.status === 'warning' ? '告警' : '离线'}
              </span>
            </div>
            {tooltip.station.latestValues && (
              <div className="mt-1 space-y-0.5">
                {Object.entries(tooltip.station.latestValues).map(([k, v]) => (
                  <div key={k} className="text-gray-400">
                    {METRIC_LABELS[k]}:{' '}
                    <span className="font-mono text-gray-200">
                      {v}{METRIC_UNITS[k]}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

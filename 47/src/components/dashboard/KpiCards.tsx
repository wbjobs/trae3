import { useMemo } from 'react'
import { useRealtimeStore } from '../../store/useRealtimeStore'
import { ARRAY_IDS } from '../../../shared/types'
import { Zap, Sun, Cpu, Radiation } from 'lucide-react'

interface KpiCardProps {
  title: string
  value: string | number
  unit: string
  icon: React.ReactNode
  sparkData: number[]
}

function MiniSparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const w = 80
  const h = 24
  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w
      const y = h - ((v - min) / range) * h
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg width={w} height={h} className="opacity-60">
      <polyline fill="none" stroke="#00e5a0" strokeWidth="1.5" points={points} />
    </svg>
  )
}

function KpiCard({ title, value, unit, icon, sparkData }: KpiCardProps) {
  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-4 animate-pulse-glow">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-text-secondary mb-1">{title}</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-display font-bold text-accent tabular-nums">
              {value}
            </span>
            <span className="text-xs text-text-secondary">{unit}</span>
          </div>
        </div>
        <div className="text-text-secondary opacity-50">{icon}</div>
      </div>
      <div className="mt-3">
        <MiniSparkline data={sparkData} />
      </div>
    </div>
  )
}

const REFERENCE_ARRAY = ARRAY_IDS[0]

export default function KpiCards() {
  const kpi = useRealtimeStore((s) => s.kpi)
  const pvDataMap = useRealtimeStore((s) => s.pvDataMap)

  const refData = pvDataMap[REFERENCE_ARRAY] || []

  const powerTrend = useMemo(() => refData.map((p) => p.power), [refData])
  const irradianceTrend = useMemo(() => refData.map((p) => p.irradiance), [refData])

  const cards: KpiCardProps[] = [
    {
      title: '总发电功率',
      value: kpi?.totalPower?.toFixed(1) ?? '--',
      unit: 'kW',
      icon: <Zap size={20} />,
      sparkData: powerTrend.length > 1 ? powerTrend : [0, 0],
    },
    {
      title: '当日发电量',
      value: kpi?.dailyEnergy?.toFixed(2) ?? '--',
      unit: 'kWh',
      icon: <Sun size={20} />,
      sparkData: powerTrend.length > 1 ? powerTrend : [0, 0],
    },
    {
      title: '在线逆变器',
      value: kpi?.onlineInverters ?? '--',
      unit: '台',
      icon: <Cpu size={20} />,
      sparkData: [0, 0],
    },
    {
      title: '当前辐照度',
      value: kpi?.currentIrradiance?.toFixed(0) ?? '--',
      unit: 'W/m²',
      icon: <Radiation size={20} />,
      sparkData: irradianceTrend.length > 1 ? irradianceTrend : [0, 0],
    },
  ]

  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => (
        <KpiCard key={card.title} {...card} />
      ))}
    </div>
  )
}

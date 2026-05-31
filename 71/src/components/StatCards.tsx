import { Zap, Activity, Thermometer, TrendingUp } from 'lucide-react'
import type { DeviceStats } from '../../shared/types'

interface StatCardsProps {
  stats: DeviceStats
}

interface CardDef {
  key: keyof DeviceStats
  label: string
  unit: string
  icon: typeof Zap
  color: string
  bgColor: string
  suffix?: string
  extra?: keyof DeviceStats
}

const cards: CardDef[] = [
  { key: 'totalPower', label: '总功率', unit: 'kW', icon: Zap, color: 'text-inv-primary', bgColor: 'bg-inv-primary/10' },
  { key: 'dailyEnergy', label: '日发电量', unit: 'kWh', icon: TrendingUp, color: 'text-inv-online', bgColor: 'bg-inv-online/10' },
  { key: 'onlineRate', label: '在线率', unit: '', icon: Activity, color: 'text-inv-warning', bgColor: 'bg-inv-warning/10', suffix: '%' },
  { key: 'onlineCount', label: '设备在线', unit: '', icon: Thermometer, color: 'text-cyan-400', bgColor: 'bg-cyan-400/10', extra: 'deviceCount' },
]

export default function StatCards({ stats }: StatCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {cards.map((card) => {
        const value = stats[card.key]
        return (
          <div key={card.key} className="bg-inv-card border border-inv-border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-slate-400">{card.label}</span>
              <div className={`w-8 h-8 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                <card.icon className={`w-4 h-4 ${card.color}`} />
              </div>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-mono font-bold">{typeof value === 'number' ? value.toFixed(1) : value}</span>
              {card.suffix && <span className="text-sm text-slate-400">{card.suffix}</span>}
              {card.unit && <span className="text-sm text-slate-400">{card.unit}</span>}
              {card.extra && (
                <span className="text-sm text-slate-500 ml-1">/ {stats[card.extra]}</span>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

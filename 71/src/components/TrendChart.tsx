import { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'

interface TrendChartProps {
  data: { time: string; power: number }[]
}

const ranges = ['1h', '6h', '24h', '7d'] as const

export default function TrendChart({ data }: TrendChartProps) {
  const [range, setRange] = useState<string>('24h')

  return (
    <div className="bg-inv-card border border-inv-border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium">集群功率趋势</h3>
        <div className="flex gap-1">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2.5 py-1 text-xs rounded transition-colors ${
                range === r ? 'bg-inv-primary/20 text-inv-primary' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={data}>
          <defs>
            <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
          <XAxis dataKey="time" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} />
          <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={{ stroke: '#334155' }} unit=" kW" />
          <Tooltip
            contentStyle={{ backgroundColor: '#1E293B', border: '1px solid #334155', borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: '#94A3B8' }}
            itemStyle={{ color: '#06B6D4' }}
          />
          <Line
            type="monotone"
            dataKey="power"
            stroke="#06B6D4"
            strokeWidth={2}
            dot={false}
            fill="url(#powerGradient)"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

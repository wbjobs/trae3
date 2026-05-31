import { useState, useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useRealtimeStore } from '../../store/useRealtimeStore'
import { ARRAY_IDS } from '../../../shared/types'

export default function IVChart() {
  const [selectedArray, setSelectedArray] = useState(ARRAY_IDS[0])
  const pvDataMap = useRealtimeStore((s) => s.pvDataMap)

  const data = pvDataMap[selectedArray] || []

  const option = useMemo(() => {
    const now = Date.now()
    const windowMs = 120_000
    return {
      backgroundColor: 'transparent',
      textStyle: { color: '#8b95a5', fontFamily: 'Noto Sans SC' },
      title: {
        text: '电流/电压趋势',
        left: 12,
        top: 8,
        textStyle: { color: '#e8ecf1', fontSize: 14, fontFamily: 'Noto Sans SC' },
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: '#1a2332',
        borderColor: '#2d3a4a',
        textStyle: { color: '#e8ecf1' },
        confine: true,
      },
      legend: {
        top: 8,
        right: 12,
        textStyle: { color: '#8b95a5' },
      },
      grid: { top: 40, right: 60, bottom: 30, left: 50 },
      xAxis: {
        type: 'time' as const,
        min: now - windowMs,
        max: now,
        axisLine: { lineStyle: { color: '#2d3a4a' } },
        axisLabel: { color: '#8b95a5', fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value' as const,
          name: 'V',
          nameTextStyle: { color: '#8b95a5' },
          axisLine: { lineStyle: { color: '#2d3a4a' } },
          axisLabel: { color: '#8b95a5', fontSize: 10 },
          splitLine: { lineStyle: { color: '#2d3a4a', type: 'dashed' as const } },
        },
        {
          type: 'value' as const,
          name: 'A',
          nameTextStyle: { color: '#8b95a5' },
          axisLine: { lineStyle: { color: '#2d3a4a' } },
          axisLabel: { color: '#8b95a5', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      animation: false,
      series: [
        {
          name: '电压',
          type: 'line' as const,
          smooth: true,
          symbol: 'none',
          showSymbol: false,
          lineStyle: { width: 2, color: '#74b9ff' },
          data: data.map((d) => [d.timestamp, d.voltage]),
        },
        {
          name: '电流',
          type: 'line' as const,
          yAxisIndex: 1,
          smooth: true,
          symbol: 'none',
          showSymbol: false,
          lineStyle: { width: 2, color: '#ffeaa7' },
          data: data.map((d) => [d.timestamp, d.current]),
        },
      ],
    }
  }, [data])

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-3">
      <div className="flex items-center justify-between mb-2 px-1">
        <select
          value={selectedArray}
          onChange={(e) => setSelectedArray(e.target.value)}
          className="bg-bg-primary text-text-primary text-xs border border-border-default rounded px-2 py-1 focus:outline-none focus:border-accent"
        >
          {ARRAY_IDS.map((id) => (
            <option key={id} value={id}>
              {id}
            </option>
          ))}
        </select>
      </div>
      <ReactECharts option={option} style={{ height: 250 }} lazyUpdate />
    </div>
  )
}

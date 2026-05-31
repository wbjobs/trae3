import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { useRealtimeStore } from '../../store/useRealtimeStore'
import { ARRAY_IDS } from '../../../shared/types'

const REFERENCE_ARRAY = ARRAY_IDS[0]

export default function IrradianceChart() {
  const pvDataMap = useRealtimeStore((s) => s.pvDataMap)

  const data = pvDataMap[REFERENCE_ARRAY] || []

  const option = useMemo(() => {
    const now = Date.now()
    const windowMs = 120_000
    const irradianceData = data.map((d) => [d.timestamp, d.irradiance])
    const tempData = data.map((d) => [d.timestamp, d.temperature])

    return {
      backgroundColor: 'transparent',
      textStyle: { color: '#8b95a5', fontFamily: 'Noto Sans SC' },
      title: {
        text: '辐照度 & 温度',
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
          name: 'W/m²',
          nameTextStyle: { color: '#8b95a5' },
          axisLine: { lineStyle: { color: '#2d3a4a' } },
          axisLabel: { color: '#8b95a5', fontSize: 10 },
          splitLine: { lineStyle: { color: '#2d3a4a', type: 'dashed' as const } },
        },
        {
          type: 'value' as const,
          name: '°C',
          nameTextStyle: { color: '#8b95a5' },
          axisLine: { lineStyle: { color: '#2d3a4a' } },
          axisLabel: { color: '#8b95a5', fontSize: 10 },
          splitLine: { show: false },
        },
      ],
      animation: false,
      series: [
        {
          name: '辐照度',
          type: 'line' as const,
          smooth: true,
          symbol: 'none',
          showSymbol: false,
          lineStyle: { width: 2, color: '#00e5a0' },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#00e5a030' },
                { offset: 1, color: '#00e5a005' },
              ],
            },
          },
          data: irradianceData,
        },
        {
          name: '温度',
          type: 'line' as const,
          yAxisIndex: 1,
          smooth: true,
          symbol: 'none',
          showSymbol: false,
          lineStyle: { width: 2, color: '#ff6b35' },
          data: tempData,
        },
      ],
    }
  }, [data])

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-3">
      <ReactECharts option={option} style={{ height: 250 }} lazyUpdate />
    </div>
  )
}

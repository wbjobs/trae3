import { useMemo, useState, useCallback } from 'react'
import ReactECharts from 'echarts-for-react'
import type { EChartsOption } from 'echarts'
import { useRealtimeStore } from '../../store/useRealtimeStore'
import { ARRAY_IDS, METRIC_LABELS } from '../../../shared/types'
import type { PvDataPoint, SlidingWindowMetrics, ForecastData } from '../../../shared/types'

const COLORS = [
  '#00e5a0', '#00b8d4', '#6c5ce7', '#fd79a8',
  '#ffeaa7', '#74b9ff', '#a29bfe', '#fab1a0',
  '#55efc4', '#81ecec', '#dfe6e9', '#fdcb6e',
]

const FORECAST_COLORS = [
  '#00e5a080', '#00b8d480', '#6c5ce780', '#fd79a880',
]

const DEFAULT_VISIBLE = 3

interface DrillDownModalProps {
  arrayId: string
  data: PvDataPoint[]
  windowMetrics: SlidingWindowMetrics | null
  onClose: () => void
}

function DrillDownModal({ arrayId, data, windowMetrics, onClose }: DrillDownModalProps) {
  const sparklineOption = useCallback((metric: keyof PvDataPoint, color: string): EChartsOption => {
    const values = data.map((d) => [d.timestamp, d[metric]])
    return {
      backgroundColor: 'transparent',
      grid: { top: 5, right: 5, bottom: 5, left: 30 },
      xAxis: {
        type: 'time' as const,
        axisLine: { show: false },
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        axisLine: { show: false },
        axisLabel: { color: '#8b95a5', fontSize: 8 },
        splitLine: { lineStyle: { color: '#2d3a4a', type: 'dashed' as const } },
      },
      series: [{
        type: 'line' as const,
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5, color },
        areaStyle: {
          color: {
            type: 'linear' as const,
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + '30' },
              { offset: 1, color: color + '05' },
            ],
          },
        },
        data: values,
      }],
    }
  }, [data])

  const metrics = [
    { key: 'voltage' as const, label: '电压', color: COLORS[0] },
    { key: 'current' as const, label: '电流', color: COLORS[1] },
    { key: 'temperature' as const, label: '温度', color: COLORS[2] },
    { key: 'irradiance' as const, label: '辐照度', color: COLORS[3] },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-bg-card border border-border-default rounded-xl p-5 max-w-3xl w-full mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-text-primary">{arrayId} 详细数据</h3>
          <button 
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {metrics.map(({ key, label, color }) => (
            <div key={key} className="bg-bg-body rounded-lg p-2">
              <div className="text-xs text-text-secondary mb-1">{label}</div>
              <ReactECharts 
                option={sparklineOption(key, color)} 
                style={{ height: 80 }} 
                lazyUpdate 
              />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-3">
          <div className="bg-bg-body rounded-lg p-3 text-center">
            <div className="text-xs text-text-secondary mb-1">平均功率</div>
            <div className="text-lg font-semibold text-green-400">
              {windowMetrics?.avgPower.toFixed(2) || '--'} kW
            </div>
          </div>
          <div className="bg-bg-body rounded-lg p-3 text-center">
            <div className="text-xs text-text-secondary mb-1">功率范围</div>
            <div className="text-lg font-semibold text-blue-400">
              {windowMetrics?.minPower.toFixed(2) || '--'} - {windowMetrics?.maxPower.toFixed(2) || '--'} kW
            </div>
          </div>
          <div className="bg-bg-body rounded-lg p-3 text-center">
            <div className="text-xs text-text-secondary mb-1">平均效率</div>
            <div className="text-lg font-semibold text-purple-400">
              {windowMetrics?.avgEfficiency.toFixed(1) || '--'}%
            </div>
          </div>
          <div className="bg-bg-body rounded-lg p-3 text-center">
            <div className="text-xs text-text-secondary mb-1">功率趋势</div>
            <div className={`text-lg font-semibold ${(windowMetrics?.powerTrend || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {(windowMetrics?.powerTrend || 0) >= 0 ? '↑' : '↓'} {Math.abs(windowMetrics?.powerTrend || 0).toFixed(2)} kW
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PowerChart() {
  const pvDataMap = useRealtimeStore((s) => s.pvDataMap)
  const forecastMap = useRealtimeStore((s) => s.forecastMap)
  const windowMetricsMap = useRealtimeStore((s) => s.windowMetricsMap)
  const [selectedArray, setSelectedArray] = useState<string | null>(null)

  const selectedData = selectedArray ? pvDataMap[selectedArray] || [] : []
  const selectedMetrics = selectedArray ? windowMetricsMap[selectedArray] || null : null

  const option = useMemo((): EChartsOption => {
    const now = Date.now()
    const windowMs = 120_000
    const forecastExtendMs = 60_000

    const series: EChartsOption['series'] = ARRAY_IDS.map((id, idx) => {
      const data = (pvDataMap[id] || []).map((d) => [d.timestamp, d.power])
      return {
        name: id,
        type: 'line' as const,
        smooth: true,
        symbol: 'none',
        showSymbol: false,
        lineStyle: { width: idx < DEFAULT_VISIBLE ? 2 : 1, color: COLORS[idx % COLORS.length] },
        areaStyle: idx < DEFAULT_VISIBLE
          ? {
              color: {
                type: 'linear' as const,
                x: 0, y: 0, x2: 0, y2: 1,
                colorStops: [
                  { offset: 0, color: COLORS[idx % COLORS.length] + '30' },
                  { offset: 1, color: COLORS[idx % COLORS.length] + '05' },
                ],
              },
            }
          : undefined,
        data,
      }
    })

    ARRAY_IDS.slice(0, DEFAULT_VISIBLE).forEach((id, idx) => {
      const forecast = forecastMap[id]
      if (forecast && forecast.forecast.length > 0) {
        const lastData = pvDataMap[id]?.[pvDataMap[id].length - 1]
        const forecastData = []
        if (lastData) {
          forecastData.push([lastData.timestamp, lastData.power])
        }
        forecast.forecast.forEach((p) => {
          forecastData.push([p.timestamp, p.power])
        })
        series.push({
          name: `${id} (预测)`,
          type: 'line' as const,
          smooth: true,
          symbol: 'none',
          showSymbol: false,
          lineStyle: { 
            width: 2, 
            color: FORECAST_COLORS[idx % FORECAST_COLORS.length],
            type: 'dashed' as const,
          },
          data: forecastData,
        })
      }
    })

    return {
      backgroundColor: 'transparent',
      textStyle: { color: '#8b95a5', fontFamily: 'Noto Sans SC' },
      title: {
        text: '功率曲线',
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
        type: 'scroll' as const,
        bottom: 0,
        textStyle: { color: '#8b95a5', fontSize: 10 },
        pageTextStyle: { color: '#8b95a5' },
      },
      grid: { top: 40, right: 20, bottom: 40, left: 50 },
      xAxis: {
        type: 'time' as const,
        min: now - windowMs,
        max: now + forecastExtendMs,
        axisLine: { lineStyle: { color: '#2d3a4a' } },
        axisLabel: { color: '#8b95a5', fontSize: 10 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value' as const,
        name: 'kW',
        nameTextStyle: { color: '#8b95a5' },
        axisLine: { lineStyle: { color: '#2d3a4a' } },
        axisLabel: { color: '#8b95a5', fontSize: 10 },
        splitLine: { lineStyle: { color: '#2d3a4a', type: 'dashed' as const } },
      },
      animation: false,
      series,
    }
  }, [pvDataMap, forecastMap])

  const onChartClick = useCallback((params: any) => {
    const seriesName = params?.seriesName?.replace(' (预测)', '')
    if (seriesName && ARRAY_IDS.includes(seriesName)) {
      setSelectedArray(seriesName)
    }
  }, [])

  const onEvents = {
    click: onChartClick,
  }

  return (
    <>
      <div className="bg-bg-card rounded-xl border border-border-default p-3">
        <ReactECharts 
          option={option} 
          style={{ height: 280 }} 
          lazyUpdate
          onEvents={onEvents}
        />
      </div>
      {selectedArray && (
        <DrillDownModal
          arrayId={selectedArray}
          data={selectedData}
          windowMetrics={selectedMetrics}
          onClose={() => setSelectedArray(null)}
        />
      )}
    </>
  )
}

import ReactECharts from 'echarts-for-react'
import { useHistoryStore } from '../../store/useHistoryStore'
import { METRIC_LABELS } from '../../../shared/types'

const METRIC_COLORS: Record<string, string> = {
  power: '#00e5a0',
  voltage: '#74b9ff',
  current: '#ffeaa7',
  temperature: '#ff6b35',
  irradiance: '#a29bfe',
}

const RIGHT_AXIS_METRICS = ['current', 'temperature']

export default function ComparisonChart() {
  const chartData = useHistoryStore((s) => s.chartData)
  const loading = useHistoryStore((s) => s.loading)

  if (loading) {
    return (
      <div className="bg-bg-card rounded-xl border border-border-default p-3 flex items-center justify-center h-[300px]">
        <span className="text-text-secondary text-sm">加载中...</span>
      </div>
    )
  }

  if (!chartData || !chartData.series.length) {
    return (
      <div className="bg-bg-card rounded-xl border border-border-default p-3 flex items-center justify-center h-[300px]">
        <span className="text-text-secondary text-sm">选择指标并点击查询以查看数据</span>
      </div>
    )
  }

  const hasRightAxis = chartData.series.some((s) => RIGHT_AXIS_METRICS.includes(s.metric))

  const series = chartData.series.map((s) => {
    const color = METRIC_COLORS[s.metric] || '#8b95a5'
    const useRight = RIGHT_AXIS_METRICS.includes(s.metric)
    return {
      name: `${s.arrayId} ${METRIC_LABELS[s.metric] || s.metric}`,
      type: 'line' as const,
      smooth: true,
      symbol: 'none',
      yAxisIndex: useRight ? 1 : 0,
      lineStyle: { width: 1.5, color },
      data: s.values,
    }
  })

  const option = {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b95a5', fontFamily: 'Noto Sans SC' },
    tooltip: {
      trigger: 'axis' as const,
      backgroundColor: '#1a2332',
      borderColor: '#2d3a4a',
      textStyle: { color: '#e8ecf1' },
    },
    legend: {
      type: 'scroll' as const,
      bottom: 0,
      textStyle: { color: '#8b95a5', fontSize: 10 },
    },
    grid: { top: 20, right: hasRightAxis ? 60 : 20, bottom: 40, left: 50 },
    xAxis: {
      type: 'category' as const,
      data: chartData.timestamps,
      axisLine: { lineStyle: { color: '#2d3a4a' } },
      axisLabel: { color: '#8b95a5', fontSize: 9, rotate: 30 },
      splitLine: { show: false },
    },
    yAxis: [
      {
        type: 'value' as const,
        axisLine: { lineStyle: { color: '#2d3a4a' } },
        axisLabel: { color: '#8b95a5', fontSize: 10 },
        splitLine: { lineStyle: { color: '#2d3a4a', type: 'dashed' as const } },
      },
      hasRightAxis
        ? {
            type: 'value' as const,
            axisLine: { lineStyle: { color: '#2d3a4a' } },
            axisLabel: { color: '#8b95a5', fontSize: 10 },
            splitLine: { show: false },
          }
        : undefined,
    ].filter(Boolean),
    series,
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-3">
      <ReactECharts option={option} style={{ height: 300 }} notMerge />
    </div>
  )
}

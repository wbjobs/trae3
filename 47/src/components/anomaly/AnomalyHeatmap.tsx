import { useEffect } from 'react'
import ReactECharts from 'echarts-for-react'
import { useAnomalyStore } from '../../store/useAnomalyStore'

export default function AnomalyHeatmap() {
  const heatmapData = useAnomalyStore((s) => s.heatmapData)
  const fetchHeatmap = useAnomalyStore((s) => s.fetchHeatmap)
  const setFilter = useAnomalyStore((s) => s.setFilter)
  const fetchEvents = useAnomalyStore((s) => s.fetchEvents)

  useEffect(() => {
    fetchHeatmap()
  }, [fetchHeatmap])

  const arrays = heatmapData?.arrays || []
  const data = arrays.map((a) => [a.col, 2 - a.row, a.anomalyCount || 0])
  const maxCount = Math.max(...arrays.map((a) => a.anomalyCount || 0), 1)

  const option = {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b95a5', fontFamily: 'Noto Sans SC' },
    title: {
      text: '异常分布热力图',
      left: 12,
      top: 8,
      textStyle: { color: '#e8ecf1', fontSize: 14, fontFamily: 'Noto Sans SC' },
    },
    tooltip: {
      backgroundColor: '#1a2332',
      borderColor: '#2d3a4a',
      textStyle: { color: '#e8ecf1' },
      formatter: (params: any) => {
        const item = arrays.find(
          (a) => a.col === params.value[0] && 2 - a.row === params.value[1]
        )
        return item
          ? `${item.arrayId}<br/>异常次数: ${item.anomalyCount}`
          : ''
      },
    },
    grid: { top: 40, right: 40, bottom: 30, left: 60 },
    xAxis: {
      type: 'category' as const,
      data: ['列1', '列2', '列3', '列4'],
      axisLine: { lineStyle: { color: '#2d3a4a' } },
      axisLabel: { color: '#8b95a5', fontSize: 10 },
      splitArea: { show: false },
    },
    yAxis: {
      type: 'category' as const,
      data: ['行A', '行B', '行C'],
      axisLine: { lineStyle: { color: '#2d3a4a' } },
      axisLabel: { color: '#8b95a5', fontSize: 10 },
      splitArea: { show: false },
    },
    visualMap: {
      min: 0,
      max: maxCount,
      calculable: true,
      orient: 'vertical' as const,
      right: 0,
      top: 'center',
      inRange: {
        color: ['#1a2332', '#ff6b35', '#ff3b5c', '#ff0040'],
      },
      textStyle: { color: '#8b95a5' },
    },
    series: [
      {
        type: 'heatmap' as const,
        data,
        label: {
          show: true,
          color: '#e8ecf1',
          fontSize: 10,
          formatter: (params: any) => {
            const item = arrays.find(
              (a) => a.col === params.value[0] && 2 - a.row === params.value[1]
            )
            return item ? item.arrayId : ''
          },
        },
        emphasis: {
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
        },
      },
    ],
  }

  const handleClick = (params: any) => {
    if (params.value) {
      const item = arrays.find(
        (a) => a.col === params.value[0] && 2 - a.row === params.value[1]
      )
      if (item) {
        setFilter({ type: undefined })
        fetchEvents()
      }
    }
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-3">
      <ReactECharts
        option={option}
        style={{ height: 300 }}
        notMerge
        onEvents={{ click: handleClick }}
      />
    </div>
  )
}

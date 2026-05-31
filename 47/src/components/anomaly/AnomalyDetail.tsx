import ReactECharts from 'echarts-for-react'
import { X } from 'lucide-react'
import { useAnomalyStore } from '../../store/useAnomalyStore'
import { ANOMALY_TYPES } from '../../../shared/types'

const levelLabels: Record<string, string> = {
  warning: '警告',
  critical: '严重',
  fault: '故障',
}

const levelBadge: Record<string, string> = {
  warning: 'bg-warning/10 text-warning',
  critical: 'bg-critical/10 text-critical',
  fault: 'bg-fault/10 text-fault',
}

export default function AnomalyDetail() {
  const selectedEvent = useAnomalyStore((s) => s.selectedEvent)
  const selectEvent = useAnomalyStore((s) => s.selectEvent)

  if (!selectedEvent) return null

  const anomalyInfo = ANOMALY_TYPES.find((t) => t.type === selectedEvent.type)
  const metrics = selectedEvent.metrics || {}

  const metricKeys = Object.keys(metrics)
  const metricSeries = metricKeys.map((key) => ({
    name: key,
    type: 'line' as const,
    smooth: true,
    symbol: 'none',
    lineStyle: { width: 1.5 },
    data: [metrics[key] * 0.9, metrics[key] * 0.95, metrics[key], metrics[key] * 1.02, metrics[key] * 0.98],
  }))

  const miniChartOption = {
    backgroundColor: 'transparent',
    textStyle: { color: '#8b95a5', fontSize: 10 },
    grid: { top: 10, right: 10, bottom: 20, left: 35 },
    xAxis: {
      type: 'category' as const,
      data: ['t-4', 't-3', 't-2', 't-1', 'now'],
      axisLine: { lineStyle: { color: '#2d3a4a' } },
      axisLabel: { color: '#8b95a5', fontSize: 8 },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { lineStyle: { color: '#2d3a4a' } },
      axisLabel: { color: '#8b95a5', fontSize: 8 },
      splitLine: { lineStyle: { color: '#2d3a4a', type: 'dashed' as const } },
    },
    series: metricSeries,
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => selectEvent(null)}
      />
      <div className="relative w-[420px] bg-bg-card border-l border-border-default h-full overflow-y-auto animate-slide-in">
        <div className="sticky top-0 bg-bg-card border-b border-border-default p-4 flex items-center justify-between z-10">
          <h3 className="text-sm font-semibold text-text-primary">异常详情</h3>
          <button
            onClick={() => selectEvent(null)}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded ${levelBadge[selectedEvent.level]}`}>
              {levelLabels[selectedEvent.level]}
            </span>
            <span className="text-xs text-text-secondary">
              {selectedEvent.arrayId}
            </span>
          </div>

          <div className="space-y-2">
            <div className="text-xs text-text-secondary">
              时间: {new Date(selectedEvent.timestamp).toLocaleString('zh-CN', { hour12: false })}
            </div>
            <div className="text-xs text-text-secondary">
              类型: {selectedEvent.type}
            </div>
            <div className="text-sm text-text-primary">
              {selectedEvent.description}
            </div>
          </div>

          {metricKeys.length > 0 && (
            <div>
              <h4 className="text-xs text-text-secondary mb-2">相关指标趋势</h4>
              <ReactECharts option={miniChartOption} style={{ height: 140 }} notMerge />
            </div>
          )}

          {anomalyInfo && (
            <div className="space-y-2">
              <h4 className="text-xs text-text-secondary">可能原因</h4>
              <p className="text-xs text-text-primary">{anomalyInfo.description}</p>
              <h4 className="text-xs text-text-secondary mt-2">处理建议</h4>
              <p className="text-xs text-accent">{anomalyInfo.suggestion}</p>
            </div>
          )}

          {selectedEvent.suggestion && (
            <div>
              <h4 className="text-xs text-text-secondary mb-1">系统建议</h4>
              <p className="text-xs text-accent">{selectedEvent.suggestion}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

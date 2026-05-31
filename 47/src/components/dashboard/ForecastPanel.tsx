import { useMemo } from 'react'
import { useRealtimeStore } from '../../store/useRealtimeStore'
import { ARRAY_IDS } from '../../../shared/types'
import type { ForecastPoint } from '../../../shared/types'

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function getConfidenceLevel(confidence: number): { label: string; color: string } {
  if (confidence >= 0.9) return { label: '高', color: 'text-green-400' }
  if (confidence >= 0.7) return { label: '中', color: 'text-yellow-400' }
  return { label: '低', color: 'text-red-400' }
}

export default function ForecastPanel() {
  const forecastMap = useRealtimeStore((s) => s.forecastMap)
  const referenceArrayId = ARRAY_IDS[0]
  const forecast = forecastMap[referenceArrayId]

  const displayPoints = useMemo((): ForecastPoint[] => {
    if (!forecast || !forecast.forecast) return []
    return forecast.forecast.slice(0, 6)
  }, [forecast])

  const maxPower = useMemo(() => {
    if (displayPoints.length === 0) return 1
    return Math.max(...displayPoints.map((p) => p.power))
  }, [displayPoints])

  const confidenceInfo = forecast ? getConfidenceLevel(forecast.confidence) : null

  return (
    <div className="bg-bg-card rounded-xl border border-border-default p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-text-primary">功率预测</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">参考阵列:</span>
          <span className="text-xs font-medium text-blue-400">{referenceArrayId}</span>
        </div>
      </div>

      {forecast && confidenceInfo ? (
        <>
          <div className="flex items-center justify-between mb-3 px-2 py-2 bg-bg-body rounded-lg">
            <span className="text-xs text-text-secondary">置信度</span>
            <span className={`text-sm font-semibold ${confidenceInfo.color}`}>
              {confidenceInfo.label} ({(forecast.confidence * 100).toFixed(0)}%)
            </span>
          </div>

          <div className="space-y-2">
            {displayPoints.map((point, idx) => {
              const barWidth = (point.power / maxPower) * 100
              return (
                <div key={idx} className="flex items-center gap-3">
                  <span className="text-xs text-text-secondary w-12 text-right">
                    {formatTime(point.timestamp)}
                  </span>
                  <div className="flex-1 h-6 bg-bg-body rounded overflow-hidden relative">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded transition-all duration-300"
                      style={{ width: `${barWidth}%` }}
                    />
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white drop-shadow">
                      {point.power.toFixed(1)} kW
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      ) : (
        <div className="flex items-center justify-center h-32 text-text-secondary text-sm">
          等待预测数据...
        </div>
      )}
    </div>
  )
}

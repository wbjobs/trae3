import { useState, useEffect } from 'react'
import { useStore } from '@/store/useStore'
import {
  ALERT_LEVEL_CONFIG,
  METRIC_LABELS,
  METRIC_UNITS,
  INDICATOR_LABELS,
} from '../../shared/types'
import type { AlertLevel, IndicatorType, ExtremeWarning, ExtremeStatistics } from '../../shared/types'
import { CheckCircle, XCircle, Calculator, AlertTriangle, TrendingUp } from 'lucide-react'
import ExtremeWarningCard from '@/components/ExtremeWarningCard'
import ExtremeChart from '@/components/ExtremeChart'

const LEVEL_TABS: { key: AlertLevel | 'all'; label: string; color: string }[] = [
  { key: 'all', label: '全部', color: '#94A3B8' },
  { key: 'blue', label: '蓝色预警', color: '#3B82F6' },
  { key: 'yellow', label: '黄色预警', color: '#F59E0B' },
  { key: 'orange', label: '橙色预警', color: '#F97316' },
  { key: 'red', label: '红色预警', color: '#EF4444' },
]

export default function Anomaly() {
  const {
    alerts,
    fetchAlerts,
    confirmAlert,
    stations,
    fetchStations,
    calculateIndicator,
    indicatorResult,
    loading,
  } = useStore()

  const [levelFilter, setLevelFilter] = useState<AlertLevel | 'all'>('all')
  const [stationFilter, setStationFilter] = useState<string>('')
  const [indicatorStation, setIndicatorStation] = useState<string>('')
  const [indicatorType, setIndicatorType] = useState<IndicatorType>('riseRate')
  const [indicatorStart, setIndicatorStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toISOString().slice(0, 16)
  })
  const [indicatorEnd, setIndicatorEnd] = useState(() => new Date().toISOString().slice(0, 16))
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const [extremeWarnings, setExtremeWarnings] = useState<ExtremeWarning[]>([])
  const [extremeStats, setExtremeStats] = useState<ExtremeStatistics | null>(null)
  const [extremeLoading, setExtremeLoading] = useState(false)

  useEffect(() => {
    fetchAlerts()
    fetchStations()
  }, [fetchAlerts, fetchStations])

  useEffect(() => {
    if (stations.length > 0 && !indicatorStation) {
      setIndicatorStation(stations[0].id)
    }
  }, [stations, indicatorStation])

  useEffect(() => {
    fetchAlerts({
      stationId: stationFilter || undefined,
      level: levelFilter !== 'all' ? levelFilter : undefined,
    })
  }, [levelFilter, stationFilter, fetchAlerts])

  useEffect(() => {
    const fetchWarnings = async () => {
      try {
        const res = await fetch('/api/extreme/warnings')
        const data = await res.json()
        if (data.warnings) {
          setExtremeWarnings(data.warnings)
        }
      } catch {
        // ignore
      }
    }
    fetchWarnings()
  }, [])

  useEffect(() => {
    if ((indicatorType === 'extremeLevel' || indicatorType === 'extremeFlow') && indicatorStation) {
      setExtremeLoading(true)
      const metric = indicatorType === 'extremeLevel' ? 'waterLevel' : 'flowRate'
      fetch(`/api/extreme/statistics?stationId=${indicatorStation}&metric=${metric}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.stationId) {
            setExtremeStats(data)
          }
          setExtremeLoading(false)
        })
        .catch(() => setExtremeLoading(false))
    } else {
      setExtremeStats(null)
    }
  }, [indicatorType, indicatorStation])

  const handleConfirm = async (alertId: string, action: 'confirmed' | 'ignored') => {
    setConfirmingId(alertId)
    await confirmAlert(alertId, action)
    setConfirmingId(null)
  }

  const handleCalculate = () => {
    if (!indicatorStation) return
    calculateIndicator({
      stationId: indicatorStation,
      indicatorType,
      startTime: indicatorStart,
      endTime: indicatorEnd,
    })
  }

  const filteredAlerts = alerts

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex gap-1">
            {LEVEL_TABS.map((t) => (
              <button
                key={t.key}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  levelFilter === t.key
                    ? 'text-white'
                    : 'text-gray-400 hover:text-gray-200 bg-primary-light/30'
                }`}
                style={
                  levelFilter === t.key
                    ? { backgroundColor: t.color + '30', color: t.color, border: `1px solid ${t.color}50` }
                    : {}
                }
                onClick={() => setLevelFilter(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div>
            <select
              className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
              value={stationFilter}
              onChange={(e) => setStationFilter(e.target.value)}
            >
              <option value="">全部站点</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {extremeWarnings.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-red-400" />
            极值预警
            <span className="text-xs text-gray-500">({extremeWarnings.length})</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {extremeWarnings.map((w) => (
              <ExtremeWarningCard key={`${w.stationId}-${w.metric}`} warning={w} />
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-alert-orange" />
            预警列表
            <span className="text-xs text-gray-500">({filteredAlerts.length})</span>
          </h3>

          {filteredAlerts.length === 0 ? (
            <div className="card p-8 text-center text-gray-500 text-sm">
              暂无预警记录
            </div>
          ) : (
            <div className="space-y-2 max-h-[calc(100vh-280px)] overflow-y-auto pr-1">
              {filteredAlerts.map((alert) => {
                const config = ALERT_LEVEL_CONFIG[alert.level]
                return (
                  <div
                    key={alert.id}
                    className="card p-4 transition-all hover:border-primary-light/50"
                    style={{ borderLeftColor: config.color, borderLeftWidth: '3px' }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: config.color }}
                        />
                        <span className="text-sm font-medium text-white">
                          {alert.stationName}
                        </span>
                        <span
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{
                            backgroundColor: config.color + '20',
                            color: config.color,
                          }}
                        >
                          {config.label}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {new Date(alert.timestamp).toLocaleString('zh-CN', {
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <div className="text-sm text-gray-300 mb-1">
                      {METRIC_LABELS[alert.metric] || alert.metric}：
                      <span className="font-mono font-semibold" style={{ color: config.color }}>
                        {alert.value}
                      </span>
                      <span className="text-gray-500 ml-1">{METRIC_UNITS[alert.metric]}</span>
                      <span className="text-gray-500 mx-2">|</span>
                      阈值：
                      <span className="font-mono text-gray-400">
                        {alert.threshold}{METRIC_UNITS[alert.metric]}
                      </span>
                    </div>

                    <div className="text-xs text-gray-500 mb-3">{alert.message}</div>

                    {alert.status === 'active' ? (
                      <div className="flex gap-2">
                        <button
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20 transition-colors disabled:opacity-50"
                          onClick={() => handleConfirm(alert.id, 'confirmed')}
                          disabled={confirmingId === alert.id}
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          确认
                        </button>
                        <button
                          className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-primary-light/30 text-gray-400 border border-primary-light/20 hover:text-gray-200 transition-colors disabled:opacity-50"
                          onClick={() => handleConfirm(alert.id, 'ignored')}
                          disabled={confirmingId === alert.id}
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          忽略
                        </button>
                      </div>
                    ) : (
                      <span
                        className={`text-xs px-2 py-0.5 rounded ${
                          alert.status === 'confirmed'
                            ? 'bg-accent/10 text-accent'
                            : 'bg-gray-500/10 text-gray-500'
                        }`}
                      >
                        {alert.status === 'confirmed' ? '已确认' : '已忽略'}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
            <Calculator className="w-4 h-4 text-accent" />
            指标计算
          </h3>

          <div className="card p-4 space-y-4">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">站点</label>
              <select
                className="w-full bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={indicatorStation}
                onChange={(e) => setIndicatorStation(e.target.value)}
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">指标类型</label>
              <div className="grid grid-cols-1 gap-1.5">
                {(Object.entries(INDICATOR_LABELS) as [IndicatorType, typeof INDICATOR_LABELS[IndicatorType]][]).map(
                  ([key, val]) => (
                    <button
                      key={key}
                      className={`text-left px-3 py-2 rounded-lg text-xs border transition-colors ${
                        indicatorType === key
                          ? 'bg-accent/10 border-accent/30 text-accent'
                          : 'bg-primary-light/20 border-primary-light/20 text-gray-400 hover:text-gray-200'
                      }`}
                      onClick={() => setIndicatorType(key)}
                    >
                      <div className="font-medium">{val.label}</div>
                      <div className="text-[10px] mt-0.5 opacity-70">{val.description}</div>
                    </button>
                  )
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">时间范围</label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  className="flex-1 bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                  value={indicatorStart}
                  onChange={(e) => setIndicatorStart(e.target.value)}
                />
                <span className="text-gray-500">~</span>
                <input
                  type="datetime-local"
                  className="flex-1 bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                  value={indicatorEnd}
                  onChange={(e) => setIndicatorEnd(e.target.value)}
                />
              </div>
            </div>

            <button
              className="w-full px-4 py-2.5 bg-accent/20 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/30 transition-colors disabled:opacity-50"
              onClick={handleCalculate}
              disabled={loading || !indicatorStation}
            >
              计算
            </button>
          </div>

          {(indicatorType === 'extremeLevel' || indicatorType === 'extremeFlow') && extremeStats && (
            <div className="card p-4 animate-slide-up">
              <div className="text-xs text-gray-400 mb-2">极值统计</div>
              {extremeLoading ? (
                <div className="text-sm text-gray-500">加载中...</div>
              ) : (
                <ExtremeChart stats={extremeStats} />
              )}
            </div>
          )}

          {indicatorResult && (indicatorType !== 'extremeLevel' && indicatorType !== 'extremeFlow') && (
            <div className="card p-4 animate-slide-up">
              <div className="text-xs text-gray-400 mb-2">计算结果</div>
              <div className="flex items-baseline gap-2 mb-3">
                <span className="text-2xl font-mono font-bold text-accent">
                  {indicatorResult.value.toFixed(2)}
                </span>
                <span className="text-sm text-gray-500">{indicatorResult.unit}</span>
              </div>
              <div className="text-xs text-gray-400 mb-2">{indicatorResult.description}</div>
              {Object.keys(indicatorResult.details).length > 0 && (
                <div className="space-y-1 mt-3 pt-3 border-t border-primary-light/20">
                  {Object.entries(indicatorResult.details).map(([k, v]) => (
                    <div key={k} className="flex justify-between text-xs">
                      <span className="text-gray-500">{k}</span>
                      <span className="font-mono text-gray-300">{v.toFixed(4)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

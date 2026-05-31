import { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import TimeSeriesChart from '@/components/TimeSeriesChart'
import RainfallWaterChart from '@/components/RainfallWaterChart'
import CorrelationChart from '@/components/CorrelationChart'
import StationCompareChart from '@/components/StationCompareChart'
import WatershedLinkageChart from '@/components/WatershedLinkageChart'
import RainfallRunoffChart from '@/components/RainfallRunoffChart'
import CorrelationMatrix from '@/components/CorrelationMatrix'
import { METRIC_LABELS, METRIC_UNITS } from '../../shared/types'
import type { UpstreamDownstreamResult, RainfallRunoffResult, CrossStationCorrelation } from '../../shared/types'

const TABS = [
  { key: 'timeseries', label: '时序曲线' },
  { key: 'rainfall-water', label: '降雨-水位' },
  { key: 'correlation', label: '指标相关性' },
  { key: 'compare', label: '站点对比' },
  { key: 'watershed-linkage', label: '流域联动' },
  { key: 'rainfall-runoff', label: '降雨径流' },
  { key: 'cross-correlation', label: '跨站相关' },
] as const

type TabKey = (typeof TABS)[number]['key']

function formatDateTime(d: Date) {
  return d.toISOString().slice(0, 16)
}

export default function Analysis() {
  const { stations, fetchStations, queryData, queryResult, loading } = useStore()
  const [tab, setTab] = useState<TabKey>('timeseries')
  const [selectedStation, setSelectedStation] = useState<string>('')
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['waterLevel', 'flowRate'])
  const [timeStart, setTimeStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return formatDateTime(d)
  })
  const [timeEnd, setTimeEnd] = useState(() => formatDateTime(new Date()))

  const [selectedRiver, setSelectedRiver] = useState<string>('')
  const [watershedData, setWatershedData] = useState<UpstreamDownstreamResult | null>(null)

  const [runoffStation, setRunoffStation] = useState<string>('')
  const [runoffData, setRunoffData] = useState<RainfallRunoffResult | null>(null)

  const [correlationStations, setCorrelationStations] = useState<string[]>([])
  const [correlationMetric, setCorrelationMetric] = useState<string>('waterLevel')
  const [crossCorrelationData, setCrossCorrelationData] = useState<CrossStationCorrelation | null>(null)

  const rivers = useMemo(() => {
    const riverSet = new Set(stations.map((s) => s.river))
    return Array.from(riverSet).filter(Boolean)
  }, [stations])

  useEffect(() => {
    fetchStations()
  }, [fetchStations])

  useEffect(() => {
    if (stations.length > 0 && !selectedStation) {
      setSelectedStation(stations[0].id)
    }
    if (stations.length > 0 && !runoffStation) {
      setRunoffStation(stations[0].id)
    }
  }, [stations, selectedStation, runoffStation])

  useEffect(() => {
    if (rivers.length > 0 && !selectedRiver) {
      setSelectedRiver(rivers[0])
    }
  }, [rivers, selectedRiver])

  const handleQuery = () => {
    if (!selectedStation) return
    queryData({
      stationIds: [selectedStation],
      startTime: timeStart,
      endTime: timeEnd,
      metrics: selectedMetrics,
      aggregation: 'hourly',
    })
  }

  useEffect(() => {
    if (selectedStation) handleQuery()
  }, [selectedStation])

  useEffect(() => {
    if (tab === 'watershed-linkage' && selectedRiver) {
      fetch(`/api/watershed/linkage?river=${encodeURIComponent(selectedRiver)}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.river) setWatershedData(data)
        })
        .catch(() => {})
    }
  }, [tab, selectedRiver])

  useEffect(() => {
    if (tab === 'rainfall-runoff' && runoffStation) {
      fetch(`/api/watershed/rainfall-runoff?stationId=${runoffStation}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.stationId) setRunoffData(data)
        })
        .catch(() => {})
    }
  }, [tab, runoffStation])

  useEffect(() => {
    if (tab === 'cross-correlation' && correlationStations.length >= 2) {
      fetch(`/api/watershed/cross-correlation?stationIds=${correlationStations.join(',')}&metric=${correlationMetric}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.metric) setCrossCorrelationData(data)
        })
        .catch(() => {})
    }
  }, [tab, correlationStations, correlationMetric])

  const chartData = useMemo(() => queryResult?.data || [], [queryResult])

  const correlationData = useMemo(() => {
    if (chartData.length === 0) return []
    return chartData
      .map((d) => ({
        x: d.values.waterLevel ?? 0,
        y: d.values.flowRate ?? 0,
        size: d.values.rainfall ?? 1,
        name: new Date(d.timestamp).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit' }),
      }))
      .filter((d) => d.x !== 0 || d.y !== 0)
  }, [chartData])

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    )
  }

  const toggleCorrelationStation = (id: string) => {
    setCorrelationStations((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const isBasicTab = ['timeseries', 'rainfall-water', 'correlation', 'compare'].includes(tab)

  return (
    <div className="space-y-4 animate-fade-in">
      {isBasicTab && (
        <div className="card p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">站点</label>
              <select
                className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={selectedStation}
                onChange={(e) => setSelectedStation(e.target.value)}
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">开始时间</label>
              <input
                type="datetime-local"
                className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={timeStart}
                onChange={(e) => setTimeStart(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1 block">结束时间</label>
              <input
                type="datetime-local"
                className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={timeEnd}
                onChange={(e) => setTimeEnd(e.target.value)}
              />
            </div>

            <div className="flex gap-2">
              {Object.keys(METRIC_LABELS).slice(0, 4).map((metric) => (
                <button
                  key={metric}
                  className={`px-2.5 py-1.5 rounded text-xs border transition-colors ${
                    selectedMetrics.includes(metric)
                      ? 'bg-accent/20 border-accent/40 text-accent'
                      : 'bg-primary-light/30 border-primary-light/30 text-gray-400 hover:text-gray-200'
                  }`}
                  onClick={() => toggleMetric(metric)}
                >
                  {METRIC_LABELS[metric]}
                </button>
              ))}
            </div>

            <button
              className="px-4 py-2 bg-accent/20 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/30 transition-colors disabled:opacity-50"
              onClick={handleQuery}
              disabled={loading}
            >
              查询
            </button>
          </div>
        </div>
      )}

      {tab === 'watershed-linkage' && (
        <div className="card p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">河流</label>
              <select
                className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={selectedRiver}
                onChange={(e) => setSelectedRiver(e.target.value)}
              >
                {rivers.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {tab === 'rainfall-runoff' && (
        <div className="card p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">站点</label>
              <select
                className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={runoffStation}
                onChange={(e) => setRunoffStation(e.target.value)}
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {tab === 'cross-correlation' && (
        <div className="card p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="text-xs text-gray-400 mb-2 block">选择站点 (至少2个)</label>
              <div className="flex flex-wrap gap-1.5">
                {stations.map((s) => (
                  <button
                    key={s.id}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                      correlationStations.includes(s.id)
                        ? 'bg-accent/20 border-accent/40 text-accent'
                        : 'bg-primary-light/30 border-primary-light/30 text-gray-400 hover:text-gray-200'
                    }`}
                    onClick={() => toggleCorrelationStation(s.id)}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">指标</label>
              <select
                className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={correlationMetric}
                onChange={(e) => setCorrelationMetric(e.target.value)}
              >
                {Object.entries(METRIC_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b border-primary-light/20 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`px-4 py-2 text-sm rounded-t transition-colors ${
              tab === t.key
                ? 'bg-accent/10 text-accent border-b-2 border-accent'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card p-5">
        {isBasicTab && chartData.length === 0 ? (
          <div className="flex items-center justify-center h-[400px] text-gray-500">
            请选择站点和时间范围后点击查询
          </div>
        ) : (
          <>
            {tab === 'timeseries' && (
              <TimeSeriesChart
                data={chartData}
                metrics={selectedMetrics}
                title={`${stations.find((s) => s.id === selectedStation)?.name || ''} - 时序曲线`}
                metricLabels={METRIC_LABELS}
                metricUnits={METRIC_UNITS}
              />
            )}
            {tab === 'rainfall-water' && (
              <RainfallWaterChart
                data={chartData}
                metricLabels={METRIC_LABELS}
              />
            )}
            {tab === 'correlation' && (
              <CorrelationChart
                data={correlationData}
                xLabel={`${METRIC_LABELS.waterLevel} (${METRIC_UNITS.waterLevel})`}
                yLabel={`${METRIC_LABELS.flowRate} (${METRIC_UNITS.flowRate})`}
                sizeLabel={`${METRIC_LABELS.rainfall} (${METRIC_UNITS.rainfall})`}
              />
            )}
            {tab === 'compare' && (
              <StationCompareChart
                metric="waterLevel"
                stations={stations.slice(0, 4).map((s) => ({
                  stationName: s.name,
                  data: chartData.map((d) => ({
                    timestamp: d.timestamp,
                    value: d.values.waterLevel ?? null,
                  })),
                }))}
                metricLabel={METRIC_LABELS.waterLevel}
                metricUnit={METRIC_UNITS.waterLevel}
              />
            )}
            {tab === 'watershed-linkage' && (
              watershedData ? (
                <WatershedLinkageChart data={watershedData} />
              ) : (
                <div className="flex items-center justify-center h-[400px] text-gray-500">
                  请选择河流查看上下游关联分析
                </div>
              )
            )}
            {tab === 'rainfall-runoff' && (
              runoffData ? (
                <RainfallRunoffChart data={runoffData} />
              ) : (
                <div className="flex items-center justify-center h-[400px] text-gray-500">
                  请选择站点查看降雨径流分析
                </div>
              )
            )}
            {tab === 'cross-correlation' && (
              crossCorrelationData ? (
                <CorrelationMatrix data={crossCorrelationData} />
              ) : (
                <div className="flex items-center justify-center h-[400px] text-gray-500">
                  请选择至少2个站点查看跨站相关性
                </div>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}

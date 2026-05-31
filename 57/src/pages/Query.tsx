import { useState, useEffect, useMemo } from 'react'
import { useStore } from '@/store/useStore'
import { METRIC_LABELS, METRIC_UNITS } from '../../shared/types'
import type { AggregationType } from '../../shared/types'
import { Download, ChevronLeft, ChevronRight, Check, X } from 'lucide-react'

const AGGREGATION_OPTIONS: { value: AggregationType; label: string }[] = [
  { value: 'raw', label: '原始数据' },
  { value: 'hourly', label: '小时聚合' },
  { value: 'daily', label: '日聚合' },
  { value: 'monthly', label: '月聚合' },
]

const PAGE_SIZE = 20

function formatDateTime(d: Date) {
  return d.toISOString().slice(0, 16)
}

export default function Query() {
  const { stations, fetchStations, queryData, queryResult, loading } = useStore()
  const [selectedStations, setSelectedStations] = useState<string[]>([])
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['waterLevel', 'flowRate'])
  const [aggregation, setAggregation] = useState<AggregationType>('hourly')
  const [timeStart, setTimeStart] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return formatDateTime(d)
  })
  const [timeEnd, setTimeEnd] = useState(() => formatDateTime(new Date()))
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState<string>('timestamp')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchStations()
  }, [fetchStations])

  useEffect(() => {
    if (stations.length > 0 && selectedStations.length === 0) {
      setSelectedStations([stations[0].id])
    }
  }, [stations, selectedStations.length])

  const handleQuery = () => {
    if (selectedStations.length === 0) return
    queryData({
      stationIds: selectedStations,
      startTime: timeStart,
      endTime: timeEnd,
      metrics: selectedMetrics,
      aggregation,
      page,
      pageSize: PAGE_SIZE,
    })
  }

  useEffect(() => {
    handleQuery()
  }, [page])

  const toggleStation = (id: string) => {
    setSelectedStations((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    )
  }

  const toggleMetric = (metric: string) => {
    setSelectedMetrics((prev) =>
      prev.includes(metric) ? prev.filter((m) => m !== metric) : [...prev, metric]
    )
  }

  const sortedData = useMemo(() => {
    const data = queryResult?.data || []
    return [...data].sort((a, b) => {
      let cmp = 0
      if (sortKey === 'timestamp') {
        cmp = a.timestamp.localeCompare(b.timestamp)
      } else if (sortKey === 'stationId') {
        cmp = a.stationId.localeCompare(b.stationId)
      } else {
        const va = a.values[sortKey] ?? 0
        const vb = b.values[sortKey] ?? 0
        cmp = va - vb
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [queryResult, sortKey, sortDir])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const totalPages = Math.ceil((queryResult?.total || 0) / PAGE_SIZE)

  const exportCSV = () => {
    if (sortedData.length === 0) return
    const headers = ['时间', '站点ID', ...selectedMetrics.map((m) => `${METRIC_LABELS[m]}(${METRIC_UNITS[m]})`)]
    const rows = sortedData.map((d) => [
      new Date(d.timestamp).toLocaleString('zh-CN'),
      d.stationId,
      ...selectedMetrics.map((m) => String(d.values[m] ?? '')),
    ])
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `水文数据_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="card p-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label className="text-xs text-gray-400 mb-1.5 block">时间范围</label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50 flex-1"
                  value={timeStart}
                  onChange={(e) => setTimeStart(e.target.value)}
                />
                <span className="text-gray-500">~</span>
                <input
                  type="datetime-local"
                  className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50 flex-1"
                  value={timeEnd}
                  onChange={(e) => setTimeEnd(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">聚合方式</label>
              <select
                className="bg-primary-light/50 border border-primary-light/40 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-accent/50"
                value={aggregation}
                onChange={(e) => setAggregation(e.target.value as AggregationType)}
              >
                {AGGREGATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            <button
              className="px-4 py-2 bg-accent/20 text-accent border border-accent/30 rounded-lg text-sm font-medium hover:bg-accent/30 transition-colors disabled:opacity-50"
              onClick={handleQuery}
              disabled={loading || selectedStations.length === 0}
            >
              查询
            </button>
          </div>

          <div className="flex gap-8">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">站点</label>
              <div className="flex flex-wrap gap-1.5">
                {stations.map((s) => (
                  <button
                    key={s.id}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors ${
                      selectedStations.includes(s.id)
                        ? 'bg-accent/20 border-accent/40 text-accent'
                        : 'bg-primary-light/30 border-primary-light/30 text-gray-400 hover:text-gray-200'
                    }`}
                    onClick={() => toggleStation(s.id)}
                  >
                    {selectedStations.includes(s.id) && <Check className="w-3 h-3 inline mr-1" />}
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">指标</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.keys(METRIC_LABELS).map((metric) => (
                  <button
                    key={metric}
                    className={`px-2.5 py-1 rounded text-xs border transition-colors ${
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
            </div>
          </div>
        </div>
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm text-gray-400">
            共 <span className="font-mono text-gray-200">{queryResult?.total || 0}</span> 条记录
          </div>
          <button
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-light/40 text-gray-300 rounded-lg text-xs hover:bg-primary-light/60 transition-colors disabled:opacity-50"
            onClick={exportCSV}
            disabled={sortedData.length === 0}
          >
            <Download className="w-3.5 h-3.5" />
            导出 CSV
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-primary-light/30">
                <th
                  className="text-left px-3 py-2.5 text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                  onClick={() => handleSort('timestamp')}
                >
                  时间 {sortKey === 'timestamp' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="text-left px-3 py-2.5 text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                  onClick={() => handleSort('stationId')}
                >
                  站点 {sortKey === 'stationId' && (sortDir === 'asc' ? '↑' : '↓')}
                </th>
                {selectedMetrics.map((m) => (
                  <th
                    key={m}
                    className="text-right px-3 py-2.5 text-gray-400 font-medium cursor-pointer hover:text-gray-200"
                    onClick={() => handleSort(m)}
                  >
                    {METRIC_LABELS[m]} ({METRIC_UNITS[m]}) {sortKey === m && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-primary-light/10 hover:bg-primary-light/20 transition-colors"
                >
                  <td className="px-3 py-2 text-gray-300 font-mono text-xs">
                    {new Date(row.timestamp).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-3 py-2 text-gray-300">
                    {stations.find((s) => s.id === row.stationId)?.name || row.stationId}
                  </td>
                  {selectedMetrics.map((m) => (
                    <td key={m} className="px-3 py-2 text-right font-mono text-gray-200">
                      {row.values[m] != null ? row.values[m]?.toFixed(2) : <X className="w-3.5 h-3.5 inline text-gray-600" />}
                    </td>
                  ))}
                </tr>
              ))}
              {sortedData.length === 0 && (
                <tr>
                  <td colSpan={2 + selectedMetrics.length} className="text-center py-12 text-gray-500">
                    暂无数据，请设置筛选条件后查询
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-primary-light/20">
            <div className="text-xs text-gray-500">
              第 {page} / {totalPages} 页
            </div>
            <div className="flex items-center gap-2">
              <button
                className="p-1.5 rounded bg-primary-light/30 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 rounded bg-primary-light/30 text-gray-400 hover:text-gray-200 disabled:opacity-30"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

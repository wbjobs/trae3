import { useState, useMemo } from 'react'
import { useHistoryStore } from '../../store/useHistoryStore'
import { METRIC_LABELS } from '../../../shared/types'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 20

export default function DataTable() {
  const chartData = useHistoryStore((s) => s.chartData)
  const query = useHistoryStore((s) => s.query)
  const [page, setPage] = useState(0)
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const rows = useMemo(() => {
    if (!chartData) return []
    return chartData.timestamps.map((ts, i) => {
      const row: Record<string, any> = { timestamp: ts }
      chartData.series.forEach((s) => {
        const key = `${s.arrayId}_${s.metric}`
        row[key] = s.values[i]
        if (!row.arrayId && s.arrayId) row.arrayId = s.arrayId
      })
      return row
    })
  }, [chartData])

  const sorted = useMemo(() => {
    if (!sortKey) return rows
    return [...rows].sort((a, b) => {
      const va = a[sortKey] ?? ''
      const vb = b[sortKey] ?? ''
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [rows, sortKey, sortDir])

  const paged = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE)

  const columns = useMemo(() => {
    if (!chartData) return []
    const cols = [{ key: 'timestamp', label: '时间' }]
    if (query.arrayIds?.length) {
      query.arrayIds.forEach((aid) => {
        query.metrics.forEach((m) => {
          cols.push({ key: `${aid}_${m}`, label: `${aid} ${METRIC_LABELS[m] || m}` })
        })
      })
    } else {
      const arrayIds = [...new Set(chartData.series.map((s) => s.arrayId))]
      arrayIds.forEach((aid) => {
        query.metrics.forEach((m) => {
          cols.push({ key: `${aid}_${m}`, label: `${aid} ${METRIC_LABELS[m] || m}` })
        })
      })
    }
    return cols
  }, [chartData, query])

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  if (!chartData || !rows.length) {
    return (
      <div className="bg-bg-card rounded-xl border border-border-default p-4 flex items-center justify-center h-[200px]">
        <span className="text-text-secondary text-sm">暂无数据</span>
      </div>
    )
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border-default overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border-default">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-3 py-2 text-left text-text-secondary font-medium cursor-pointer hover:text-text-primary whitespace-nowrap"
                >
                  {col.label}
                  {sortKey === col.key && (sortDir === 'asc' ? ' ↑' : ' ↓')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-border-default/50 ${
                  i % 2 === 0 ? 'bg-bg-card' : 'bg-bg-primary/30'
                }`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-text-primary whitespace-nowrap">
                    {col.key === 'timestamp'
                      ? new Date(row[col.key]).toLocaleString('zh-CN', { hour12: false })
                      : typeof row[col.key] === 'number'
                      ? row[col.key].toFixed(2)
                      : row[col.key] ?? '-'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-2 border-t border-border-default">
        <span className="text-[10px] text-text-secondary">
          共 {sorted.length} 条，第 {page + 1}/{totalPages} 页
        </span>
        <div className="flex items-center gap-1">
          <button
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  )
}

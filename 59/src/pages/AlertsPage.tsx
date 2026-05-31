import { useEffect, useMemo } from 'react'
import { useAlertStore } from '@/stores/alertStore'
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react'
import AlertRow from '@/components/alerts/AlertRow'
import AlertDetail from '@/components/alerts/AlertDetail'

const levelFilters = [
  { key: '', label: 'All' },
  { key: 'critical', label: 'Critical', color: 'bg-red-alert' },
  { key: 'major', label: 'Major', color: 'bg-amber-warn' },
  { key: 'minor', label: 'Minor', color: 'bg-yellow-400' },
]

const statusFilters = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'resolved', label: 'Resolved' },
]

export default function AlertsPage() {
  const { alerts, filters, pagination, selectedAlert, loading, fetchAlerts, setFilters, setPage, confirmAlert, resolveAlert } = useAlertStore()

  useEffect(() => {
    fetchAlerts()
  }, [filters, pagination.page, fetchAlerts])

  const levelCounts = useMemo(() => {
    const counts = { critical: 0, major: 0, minor: 0 }
    alerts.forEach((a) => { counts[a.level]++ })
    return counts
  }, [alerts])

  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit))
  const pageNumbers = useMemo(() => {
    const pages: number[] = []
    const start = Math.max(1, pagination.page - 2)
    const end = Math.min(totalPages, pagination.page + 2)
    for (let i = start; i <= end; i++) pages.push(i)
    return pages
  }, [pagination.page, totalPages])

  return (
    <div className="h-full flex flex-col relative">
      <div className="px-6 py-4 border-b border-slate-700/50 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center">
              <Bell className="w-5 h-5 text-neon-cyan" />
            </div>
            <h1 className="text-xl font-display font-bold neon-text">告警中心</h1>
          </div>
          {loading && (
            <div className="w-5 h-5 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
          )}
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-1">级别</span>
            {levelFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilters({ ...filters, level: f.key || undefined }); fetchAlerts({ ...filters, level: f.key || undefined }) }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-body transition-all ${
                  (filters.level || '') === f.key
                    ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30'
                    : 'bg-steel-gray/50 text-slate-400 border border-transparent hover:text-slate-200'
                }`}
              >
                {f.label}
                {f.key && (
                  <span className={`inline-block w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${f.color}`}>
                    {levelCounts[f.key as keyof typeof levelCounts]}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="w-px h-5 bg-slate-700" />

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 mr-1">状态</span>
            {statusFilters.map((f) => (
              <button
                key={f.key}
                onClick={() => { setFilters({ ...filters, status: f.key || undefined }); fetchAlerts({ ...filters, status: f.key || undefined }) }}
                className={`px-3 py-1.5 rounded text-xs font-body transition-all ${
                  (filters.status || '') === f.key
                    ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30'
                    : 'bg-steel-gray/50 text-slate-400 border border-transparent hover:text-slate-200'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700/50 text-xs text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-3 text-left font-body">级别</th>
              <th className="px-4 py-3 text-left font-body">设备</th>
              <th className="px-4 py-3 text-left font-body">参数</th>
              <th className="px-4 py-3 text-left font-body">值</th>
              <th className="px-4 py-3 text-left font-body">阈值</th>
              <th className="px-4 py-3 text-left font-body">时间</th>
              <th className="px-4 py-3 text-left font-body">状态</th>
              <th className="px-4 py-3 text-left font-body">操作</th>
            </tr>
          </thead>
          <tbody>
            {alerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                onClick={() => useAlertStore.getState().fetchAlert(alert.id)}
                onConfirm={() => useAlertStore.setState({ selectedAlert: alert })}
                onResolve={() => useAlertStore.setState({ selectedAlert: alert })}
              />
            ))}
            {alerts.length === 0 && !loading && (
              <tr>
                <td colSpan={8} className="text-center py-16 text-slate-500 text-sm">
                  暂无告警数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-3 border-t border-slate-700/50 flex items-center justify-between">
        <span className="text-xs text-slate-500">
          共 {pagination.total} 条告警
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage(pagination.page - 1)}
            disabled={pagination.page <= 1}
            className="p-1.5 rounded hover:bg-steel-gray text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {pageNumbers.map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded text-xs font-body transition-colors ${
                p === pagination.page
                  ? 'bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/30'
                  : 'text-slate-400 hover:bg-steel-gray hover:text-slate-200'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage(pagination.page + 1)}
            disabled={pagination.page >= totalPages}
            className="p-1.5 rounded hover:bg-steel-gray text-slate-400 hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <AlertDetail
        alert={selectedAlert}
        onClose={() => useAlertStore.setState({ selectedAlert: null })}
        onConfirm={(id, confirmedBy) => confirmAlert(id, confirmedBy)}
        onResolve={(id, remark) => resolveAlert(id, remark)}
      />
    </div>
  )
}

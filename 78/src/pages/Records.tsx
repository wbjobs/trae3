import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInvoiceStore } from '@/store/invoice'
import { Search, Eye, Trash2, Download, ChevronLeft, ChevronRight, Calendar, CheckSquare, Square, FileJson, FileSpreadsheet } from 'lucide-react'
import type { Invoice } from '@/types/invoice'

const statusMap: Record<Invoice['status'], { label: string; dot: string }> = {
  pending: { label: '待识别', dot: 'bg-gray-400' },
  processing: { label: '识别中', dot: 'bg-amber-500 animate-pulse' },
  completed: { label: '已完成', dot: 'bg-mint-500' },
  failed: { label: '失败', dot: 'bg-coral-500' },
}

const PAGE_SIZE = 10

export default function Records() {
  const navigate = useNavigate()
  const { invoices, totalCount, loading, fetchInvoices, deleteInvoice } = useInvoiceStore()
  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv')
  const [showExportMenu, setShowExportMenu] = useState(false)

  const loadInvoices = useCallback(() => {
    const filters: Record<string, string | number> = { page, limit: PAGE_SIZE }
    if (keyword) filters.keyword = keyword
    if (status) filters.status = status
    if (dateFrom) filters.dateFrom = dateFrom
    if (dateTo) filters.dateTo = dateTo
    fetchInvoices(filters)
  }, [page, keyword, status, dateFrom, dateTo, fetchInvoices])

  useEffect(() => {
    loadInvoices()
  }, [loadInvoices])

  const handleSearch = () => { setPage(1); loadInvoices() }

  const handleDelete = async (id: string) => {
    await deleteInvoice(id)
    setDeleteId(null)
    setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n })
  }

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === invoices.length && invoices.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(invoices.map((inv) => inv.id)))
    }
  }

  const isAllSelected = invoices.length > 0 && selectedIds.size === invoices.length

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))

  const handleExport = (format: 'csv' | 'json') => {
    const idsParam = selectedIds.size > 0 ? Array.from(selectedIds).join(',') : undefined
    const params = new URLSearchParams()
    params.set('format', format)
    if (idsParam) params.set('ids', idsParam)
    if (status) params.set('status', status)
    if (keyword) params.set('keyword', keyword)
    if (dateFrom) params.set('dateFrom', dateFrom)
    if (dateTo) params.set('dateTo', dateTo)

    const url = `/api/invoices/export?${params.toString()}`
    const a = document.createElement('a')
    a.href = url
    a.download = `invoices.${format}`
    a.click()
    setShowExportMenu(false)
  }

  return (
    <div className="p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-serif text-2xl font-semibold text-indigo-900">票据管理</h2>
          <p className="text-sm text-gray-400 mt-1">共 {totalCount} 条记录</p>
        </div>
        <div className="relative">
          <button
            onClick={() => setShowExportMenu(!showExportMenu)}
            className="flex items-center gap-2 px-4 py-2 border border-indigo-200 rounded-lg text-sm text-indigo-800 hover:bg-indigo-50 transition-colors"
          >
            <Download size={16} />
            导出数据
            {selectedIds.size > 0 && (
              <span className="text-xs bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full">
                {selectedIds.size} 项
              </span>
            )}
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl border border-indigo-100 shadow-lg z-20 animate-slide-up overflow-hidden">
              <button
                onClick={() => handleExport('csv')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-indigo-800 hover:bg-indigo-50 transition-colors"
              >
                <FileSpreadsheet size={16} className="text-mint-500" />
                导出为 CSV
              </button>
              <button
                onClick={() => handleExport('json')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-indigo-800 hover:bg-indigo-50 transition-colors border-t border-indigo-50"
              >
                <FileJson size={16} className="text-amber-500" />
                导出为 JSON
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="搜索发票号码或销售方..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
            className="w-full pl-9 pr-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30"
          />
        </div>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          className="px-3 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-amber-500"
        >
          <option value="">全部状态</option>
          <option value="pending">待识别</option>
          <option value="processing">识别中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
        </select>
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-gray-400" />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
            className="px-2 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-amber-500"
          />
          <span className="text-xs text-gray-400">至</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
            className="px-2 py-2 text-sm border border-indigo-200 rounded-lg focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-20 text-indigo-400 text-sm">加载中...</div>
      ) : invoices.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">暂无数据</div>
      ) : (
        <div className="bg-white rounded-xl border border-indigo-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-indigo-50 text-indigo-800">
                <th className="px-3 py-3 text-center w-10">
                  <button onClick={toggleSelectAll} className="p-0.5">
                    {isAllSelected ? (
                      <CheckSquare size={16} className="text-amber-500" />
                    ) : (
                      <Square size={16} className="text-indigo-300" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 text-left font-medium">发票号码</th>
                <th className="px-4 py-3 text-left font-medium">开票日期</th>
                <th className="px-4 py-3 text-right font-medium">金额</th>
                <th className="px-4 py-3 text-right font-medium">价税合计</th>
                <th className="px-4 py-3 text-left font-medium">销售方</th>
                <th className="px-4 py-3 text-center font-medium">状态</th>
                <th className="px-4 py-3 text-left font-medium">创建时间</th>
                <th className="px-4 py-3 text-center font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="table-zebra">
              {invoices.map((inv) => (
                <tr key={inv.id} className={`border-t border-indigo-50 transition-colors ${selectedIds.has(inv.id) ? 'bg-amber-50/50' : ''}`}>
                  <td className="px-3 py-3 text-center">
                    <button onClick={() => toggleSelect(inv.id)} className="p-0.5">
                      {selectedIds.has(inv.id) ? (
                        <CheckSquare size={16} className="text-amber-500" />
                      ) : (
                        <Square size={16} className="text-indigo-300" />
                      )}
                    </button>
                  </td>
                  <td className="px-4 py-3 font-mono text-indigo-800">{inv.invoiceNumber || '-'}</td>
                  <td className="px-4 py-3 font-mono">{inv.invoiceDate || '-'}</td>
                  <td className="px-4 py-3 text-right font-mono">{inv.amount !== null ? inv.amount.toLocaleString() : '-'}</td>
                  <td className="px-4 py-3 text-right font-mono font-medium">{inv.totalAmount !== null ? inv.totalAmount.toLocaleString() : '-'}</td>
                  <td className="px-4 py-3 truncate max-w-[160px]">{inv.sellerName || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${statusMap[inv.status]?.dot}`} />
                      <span className="text-xs">{statusMap[inv.status]?.label}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-400 font-mono">{inv.createdAt || '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button
                        onClick={() => navigate(`/result/${inv.id}`)}
                        className="p-1.5 rounded hover:bg-indigo-50 transition-colors"
                        title="查看详情"
                      >
                        <Eye size={15} className="text-indigo-700" />
                      </button>
                      <button
                        onClick={() => setDeleteId(inv.id)}
                        className="p-1.5 rounded hover:bg-coral-100 transition-colors"
                        title="删除"
                      >
                        <Trash2 size={15} className="text-coral-500" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-gray-400">
            第 {page} / {totalPages} 页
            {selectedIds.size > 0 && <span className="ml-3 text-amber-600">已选 {selectedIds.size} 项</span>}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="p-2 rounded-lg border border-indigo-200 hover:bg-indigo-50 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={16} className="text-indigo-700" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="p-2 rounded-lg border border-indigo-200 hover:bg-indigo-50 disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={16} className="text-indigo-700" />
            </button>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center modal-backdrop" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-xl p-6 w-80 shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-indigo-900 mb-2">确认删除</h3>
            <p className="text-sm text-gray-500 mb-4">删除后无法恢复，确定要删除该票据吗？</p>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setDeleteId(null)} className="px-4 py-1.5 text-sm text-indigo-800 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
                取消
              </button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-1.5 text-sm text-white bg-coral-500 rounded-lg hover:bg-coral-500/90 transition-colors">
                删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

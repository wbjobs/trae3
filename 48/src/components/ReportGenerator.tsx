import React, { useState, useEffect } from "react"
import type { InspectionResult } from "@/types"
import { getInspections, downloadSingleReport, downloadBatchReport, getSystemStats } from "@/api/client"

interface ReportGeneratorProps {
  onClose: () => void
}

const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function ReportGenerator({ onClose }: ReportGeneratorProps) {
  const [inspections, setInspections] = useState<InspectionResult[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [dateRange, setDateRange] = useState({ start: "", end: "" })
  const [statusFilter, setStatusFilter] = useState("")
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [stats, setStats] = useState<any>(null)

  useEffect(() => {
    loadData()
    loadStats()
  }, [page, statusFilter])

  const loadData = async () => {
    setLoading(true)
    try {
      const result = await getInspections({ page, page_size: 20, status: statusFilter || undefined })
      setInspections(result.items)
      setTotal(result.total)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const s = await getSystemStats()
      setStats(s)
    } catch (e) {
      console.error("Failed to load stats:", e)
    }
  }

  const toggleSelect = (id: string) => {
    const ns = new Set(selected)
    if (ns.has(id)) ns.delete(id)
    else ns.add(id)
    setSelected(ns)
  }

  const toggleSelectAll = () => {
    if (selected.size === inspections.length && inspections.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(inspections.map(i => i.id)))
    }
  }

  const handleGenerateSingle = async (id: string) => {
    setGenerating(true)
    try {
      const blob = await downloadSingleReport(id)
      downloadBlob(blob, `inspection_${id}_report.pdf`)
    } catch (e) {
      console.error("Failed to generate report:", e)
      alert("报告生成失败")
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateBatch = async () => {
    if (selected.size === 0) {
      alert("请先选择至少一条巡检记录")
      return
    }
    setGenerating(true)
    try {
      const blob = await downloadBatchReport(Array.from(selected))
      downloadBlob(blob, `batch_report_${selected.size}_inspections.pdf`)
    } catch (e) {
      console.error("Failed to generate batch report:", e)
      alert("批量报告生成失败")
    } finally {
      setGenerating(false)
    }
  }

  const filtered = inspections.filter(i => {
    if (dateRange.start && i.created_at < dateRange.start) return false
    if (dateRange.end && i.created_at > dateRange.end + "T23:59:59") return false
    return true
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">检测报告生成</h2>
            <p className="text-sm text-slate-500 mt-0.5">选择巡检记录生成 PDF 检测报告，支持批量导出</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-2xl leading-none">
            ×
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-200">
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <div className="text-2xl font-bold text-blue-600">{stats.inspections.total}</div>
              <div className="text-xs text-slate-500">总巡检数</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <div className="text-2xl font-bold text-red-600">{stats.inspections.total_defects}</div>
              <div className="text-xs text-slate-500">总缺陷数</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <div className="text-2xl font-bold text-emerald-600">{stats.vector_store.cache_stats.hit_rate.toFixed(1)}%</div>
              <div className="text-xs text-slate-500">缓存命中率</div>
            </div>
            <div className="bg-white rounded-xl p-3 shadow-sm border border-slate-100">
              <div className="text-2xl font-bold text-amber-600">{stats.inference_engine.avg_inference_time_ms.toFixed(0)}ms</div>
              <div className="text-xs text-slate-500">平均推理耗时</div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 px-6 py-3 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">开始日期</label>
            <input
              type="date"
              value={dateRange.start}
              onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">结束日期</label>
            <input
              type="date"
              value={dateRange.end}
              onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">状态</label>
            <select
              value={statusFilter}
              onChange={e => { setStatusFilter(e.target.value); setPage(1) }}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            >
              <option value="">全部</option>
              <option value="completed">已完成</option>
              <option value="processing">处理中</option>
              <option value="failed">失败</option>
            </select>
          </div>
          <div className="flex-1" />
          <div className="text-sm text-slate-600">
            已选择 <span className="font-semibold text-blue-600">{selected.size}</span> 条
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="border-b border-slate-200">
                  <th className="px-6 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === inspections.length && inspections.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">文件名</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">缺陷数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">创建时间</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(i => (
                  <tr key={i.id} className="hover:bg-slate-50">
                    <td className="px-6 py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(i.id)}
                        onChange={() => toggleSelect(i.id)}
                        className="w-4 h-4 rounded border-slate-300 text-blue-600"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 font-medium">{i.filename}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        i.defects.length === 0 ? "bg-emerald-100 text-emerald-700" :
                        i.defects.length > 3 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>
                        {i.defects.length}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        i.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                        i.status === "processing" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"
                      }`}>
                        {i.status === "completed" ? "已完成" : i.status === "processing" ? "处理中" : "失败"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {new Date(i.created_at).toLocaleString("zh-CN")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleGenerateSingle(i.id)}
                        disabled={generating || i.status !== "completed"}
                        className="px-3 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50"
                      >
                        生成报告
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-3 bg-slate-50 border-t border-slate-200">
          <div className="text-sm text-slate-500">
            共 {total} 条，第 {page} 页
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1 || loading}
              className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50"
            >
              上一页
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * 20 >= total || loading}
              className="px-3 py-1 text-sm border border-slate-300 rounded-lg disabled:opacity-50"
            >
              下一页
            </button>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            关闭
          </button>
          <button
            onClick={handleGenerateBatch}
            disabled={selected.size === 0 || generating}
            className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {generating && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            生成批量报告 ({selected.size})
          </button>
        </div>
      </div>
    </div>
  )
}

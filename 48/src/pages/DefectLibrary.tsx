import { useCallback, useEffect, useState } from "react"
import { Search, Upload, Filter, ChevronRight, CheckCircle2, XCircle, FileImage, ArrowRight, Edit3 } from "lucide-react"
import { useStore } from "@/store"
import { getDefects, getDefectTypes, confirmDefect, searchDefects, searchDefectsByImage } from "@/api/client"
import { severityColor, severityLabel, defectTypeName, formatDateTime } from "@/utils/format"
import type { DefectRecord } from "@/types"
import { DefectAnnotationEditor } from "@/components/DefectAnnotationEditor"

function TypeSidebar({
  types,
  selected,
  onSelect,
}: {
  types: { code: string; name: string; count: number }[]
  selected: string | null
  onSelect: (code: string | null) => void
}) {
  return (
    <div className="glass-card p-4">
      <h3 className="text-xs text-navy-600 uppercase tracking-wider mb-3">缺陷分类</h3>
      <div className="space-y-1">
        <button
          onClick={() => onSelect(null)}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
            selected === null ? "bg-cyber-500/10 text-cyber-400" : "text-slate-300 hover:bg-navy-700/50"
          }`}
        >
          <span>全部类型</span>
        </button>
        {types.map((t) => (
          <button
            key={t.code}
            onClick={() => onSelect(t.code)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
              selected === t.code ? "bg-cyber-500/10 text-cyber-400" : "text-slate-300 hover:bg-navy-700/50"
            }`}
          >
            <span>{t.name}</span>
            <span className="text-xs text-navy-600 bg-navy-700/50 px-1.5 py-0.5 rounded">{t.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function SearchPanel({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState("")
  const [searchMode, setSearchMode] = useState<"text" | "image">("text")

  const handleImageSearch = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        const result = await searchDefectsByImage(file, 10)
        useStore.getState().setSearchResults(result.results)
      }
    },
    []
  )

  return (
    <div className="glass-card p-4">
      <h3 className="text-xs text-navy-600 uppercase tracking-wider mb-3">向量检索</h3>
      <div className="flex gap-2 mb-3">
        <button
          onClick={() => setSearchMode("text")}
          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            searchMode === "text" ? "bg-cyber-500/10 text-cyber-400 border border-cyber-500/20" : "text-navy-600 hover:text-slate-300"
          }`}
        >
          文本搜索
        </button>
        <button
          onClick={() => setSearchMode("image")}
          className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            searchMode === "image" ? "bg-cyber-500/10 text-cyber-400 border border-cyber-500/20" : "text-navy-600 hover:text-slate-300"
          }`}
        >
          图片搜索
        </button>
      </div>

      {searchMode === "text" ? (
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch(query)}
            placeholder="输入缺陷描述..."
            className="flex-1 bg-navy-800/50 border border-navy-700/50 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder:text-navy-600 focus:outline-none focus:border-cyber-500/50"
          />
          <button onClick={() => onSearch(query)} className="px-3 py-2 bg-cyber-500/10 text-cyber-400 rounded-lg hover:bg-cyber-500/20 transition-colors">
            <Search className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <label className="flex items-center justify-center gap-2 border border-dashed border-navy-700 rounded-lg px-3 py-4 text-sm text-navy-600 hover:border-navy-600 hover:text-slate-300 cursor-pointer transition-all">
          <Upload className="w-4 h-4" />
          <span>上传参考图片</span>
          <input type="file" accept="image/*" onChange={handleImageSearch} className="hidden" />
        </label>
      )}
    </div>
  )
}

function DefectCard({
  defect,
  onConfirm,
  onDetail,
  onEdit,
}: {
  defect: DefectRecord
  onConfirm: (id: string, confirmed: boolean) => void
  onDetail: (defect: DefectRecord) => void
  onEdit: (defect: DefectRecord) => void
}) {
  return (
    <div className="glass-card p-4 hover:glow-border transition-all duration-300 animate-fade-in">
      <div className="flex gap-3">
        <div className="w-24 h-24 rounded-lg bg-navy-700/50 flex-shrink-0 overflow-hidden">
          {defect.image_url ? (
            <img src={defect.image_url} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileImage className="w-6 h-6 text-navy-600" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-200">{defectTypeName(defect.type)}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${severityColor(defect.severity)}`}>
              {severityLabel(defect.severity)}
            </span>
            {defect.confirmed ? (
              <CheckCircle2 className="w-3.5 h-3.5 text-safe-500" />
            ) : (
              <XCircle className="w-3.5 h-3.5 text-navy-600" />
            )}
          </div>
          <p className="text-xs text-navy-600 mt-1 line-clamp-2">{defect.description}</p>
          <div className="flex items-center gap-2 mt-2">
            <div className="flex-1 h-1 bg-navy-700 rounded-full overflow-hidden">
              <div className="h-full bg-cyber-500 rounded-full" style={{ width: `${defect.confidence * 100}%` }} />
            </div>
            <span className="text-[10px] text-navy-600">{(defect.confidence * 100).toFixed(1)}%</span>
          </div>
          {defect.similarity !== undefined && (
            <div className="text-[10px] text-cyber-400 mt-1">相似度: {(defect.similarity * 100).toFixed(1)}%</div>
          )}
          <div className="flex items-center gap-2 mt-2">
            <span className="text-[10px] text-navy-600">{formatDateTime(defect.created_at)}</span>
            <div className="flex-1" />
            {!defect.confirmed && (
              <>
                <button
                  onClick={() => onConfirm(defect.id, true)}
                  className="text-[10px] px-2 py-1 rounded bg-safe-500/10 text-safe-400 hover:bg-safe-500/20 transition-colors"
                >
                  确认
                </button>
                <button
                  onClick={() => onConfirm(defect.id, false)}
                  className="text-[10px] px-2 py-1 rounded bg-danger-500/10 text-danger-400 hover:bg-danger-500/20 transition-colors"
                >
                  否定
                </button>
              </>
            )}
            <button
              onClick={() => onEdit(defect)}
              className="text-[10px] px-2 py-1 rounded bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-colors flex items-center gap-1"
            >
              <Edit3 className="w-3 h-3" /> 标注
            </button>
            <button
              onClick={() => onDetail(defect)}
              className="text-[10px] px-2 py-1 rounded bg-navy-700/50 text-slate-300 hover:bg-navy-700 transition-colors flex items-center gap-1"
            >
              详情 <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function DefectDetail({ defect, onClose }: { defect: DefectRecord; onClose: () => void }) {
  return (
    <div className="glass-card p-6 animate-slide-up">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-slate-200">缺陷详情</h3>
        <button onClick={onClose} className="text-navy-600 hover:text-slate-300 transition-colors text-xs">
          关闭
        </button>
      </div>
      <div className="grid grid-cols-2 gap-6">
        <div className="aspect-square rounded-lg bg-navy-700/50 overflow-hidden border border-navy-700/50">
          {defect.image_url ? (
            <img src={defect.image_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileImage className="w-10 h-10 text-navy-600" />
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-navy-600">缺陷类型</div>
            <div className="text-sm text-slate-200 mt-1">{defectTypeName(defect.type)}</div>
          </div>
          <div>
            <div className="text-xs text-navy-600">严重程度</div>
            <span className={`inline-block text-xs px-2 py-0.5 rounded border mt-1 ${severityColor(defect.severity)}`}>
              {severityLabel(defect.severity)}
            </span>
          </div>
          <div>
            <div className="text-xs text-navy-600">置信度</div>
            <div className="text-sm text-slate-200 mt-1">{(defect.confidence * 100).toFixed(1)}%</div>
          </div>
          <div>
            <div className="text-xs text-navy-600">描述</div>
            <div className="text-sm text-slate-200 mt-1">{defect.description}</div>
          </div>
          <div>
            <div className="text-xs text-navy-600">确认状态</div>
            <div className="text-sm mt-1 flex items-center gap-1">
              {defect.confirmed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-safe-500" /> 已确认
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4 text-navy-600" /> 待确认
                </>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-navy-600">发现时间</div>
            <div className="text-sm text-slate-200 mt-1">{formatDateTime(defect.created_at)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function DefectLibrary() {
  const { defects, defectTypes, searchResults, setDefects, setDefectTypes, setSearchResults, setCurrentDefect, currentDefect, updateDefectInList } = useStore()
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [severityFilter, setSeverityFilter] = useState<string | null>(null)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [editingDefect, setEditingDefect] = useState<DefectRecord | null>(null)

  useEffect(() => {
    getDefectTypes().then(setDefectTypes).catch(() => {})
  }, [setDefectTypes])

  useEffect(() => {
    getDefects({ page: 1, page_size: 50, type: selectedType || undefined, severity: severityFilter || undefined })
      .then((res) => setDefects(res.items, res.total))
      .catch(() => {})
  }, [selectedType, severityFilter, setDefects])

  const handleSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) return
      const result = await searchDefects(query, 10)
      setSearchResults(result.results)
      setShowSearchResults(true)
    },
    [setSearchResults]
  )

  const handleConfirm = useCallback(
    async (id: string, confirmed: boolean) => {
      const updated = await confirmDefect(id, confirmed, "")
      updateDefectInList(updated)
    },
    [updateDefectInList]
  )

  const handleEdit = useCallback((defect: DefectRecord) => {
    setEditingDefect(defect)
  }, [])

  const handleDefectUpdated = useCallback((updated: DefectRecord) => {
    updateDefectInList(updated)
    setEditingDefect(null)
  }, [updateDefectInList])

  const displayDefects = showSearchResults ? searchResults : defects

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">缺陷库管理</h2>
        <p className="text-sm text-navy-600 mt-1">浏览、检索与确认缺陷记录</p>
      </div>

      <div className="grid grid-cols-4 gap-6">
        <div className="col-span-1 space-y-4">
          <TypeSidebar
            types={defectTypes.map((t) => ({ code: t.code, name: t.name, count: t.count }))}
            selected={selectedType}
            onSelect={(code) => {
              setSelectedType(code)
              setShowSearchResults(false)
            }}
          />
          <SearchPanel onSearch={handleSearch} />
          <div className="glass-card p-4">
            <h3 className="text-xs text-navy-600 uppercase tracking-wider mb-3 flex items-center gap-1">
              <Filter className="w-3 h-3" /> 严重程度
            </h3>
            <div className="space-y-1">
              {[null, "critical", "high", "medium", "low"].map((s) => (
                <button
                  key={s || "all"}
                  onClick={() => setSeverityFilter(s)}
                  className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-all ${
                    severityFilter === s ? "bg-cyber-500/10 text-cyber-400" : "text-slate-300 hover:bg-navy-700/50"
                  }`}
                >
                  {s ? severityLabel(s) : "全部"}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="col-span-3">
          {showSearchResults && (
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs text-cyber-400 bg-cyber-500/10 px-2 py-1 rounded">搜索结果</span>
              <button
                onClick={() => setShowSearchResults(false)}
                className="text-xs text-navy-600 hover:text-slate-300 transition-colors flex items-center gap-1"
              >
                返回列表 <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {currentDefect ? (
            <DefectDetail defect={currentDefect} onClose={() => setCurrentDefect(null)} />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {displayDefects.length === 0 ? (
                <div className="col-span-2 glass-card p-16 text-center">
                  <FileImage className="w-10 h-10 text-navy-600 mx-auto mb-3" />
                  <p className="text-slate-300 font-medium">暂无缺陷记录</p>
                  <p className="text-navy-600 text-sm mt-1">通过巡检工作台上传图片开始识别</p>
                </div>
              ) : (
                displayDefects.map((d) => (
                  <DefectCard key={d.id} defect={d} onConfirm={handleConfirm} onDetail={setCurrentDefect} onEdit={handleEdit} />
                ))
              )}
            </div>
          )}
        </div>
      </div>
      {editingDefect && (
        <DefectAnnotationEditor
          defect={editingDefect}
          imageUrl={editingDefect.image_url || ""}
          onClose={() => setEditingDefect(null)}
          onUpdated={handleDefectUpdated}
        />
      )}
    </div>
  )
}

import { useCallback, useRef, useState } from "react"
import { Upload, FileImage, CheckCircle2, XCircle, Loader2, AlertTriangle, Eye } from "lucide-react"
import { useStore } from "@/store"
import { uploadImages, getInspection } from "@/api/client"
import { severityColor, severityLabel, defectTypeName, formatDateTime } from "@/utils/format"
import type { InspectionResult } from "@/types"

function UploadZone({ onUpload }: { onUpload: (files: File[]) => void }) {
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true)
    else if (e.type === "dragleave") setDragActive(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragActive(false)
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"))
      if (files.length > 0) onUpload(files)
    },
    [onUpload]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []).filter((f) => f.type.startsWith("image/"))
      if (files.length > 0) onUpload(files)
    },
    [onUpload]
  )

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`relative border-2 border-dashed rounded-xl p-10 transition-all duration-300 ${
        dragActive
          ? "border-cyber-500 bg-cyber-500/5 scale-[1.01]"
          : "border-navy-700 hover:border-navy-600 bg-navy-800/30"
      }`}
    >
      <input type="file" multiple accept="image/*" onChange={handleChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
      <div className="flex flex-col items-center gap-4">
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-colors ${dragActive ? "bg-cyber-500/20" : "bg-navy-700/50"}`}>
          <Upload className={`w-8 h-8 ${dragActive ? "text-cyber-400" : "text-navy-600"}`} />
        </div>
        <div className="text-center">
          <p className="text-slate-300 text-sm font-medium">拖拽图片到此处上传</p>
          <p className="text-navy-600 text-xs mt-1">支持 JPG、PNG、BMP 格式，可批量上传</p>
        </div>
      </div>
    </div>
  )
}

function ResultCard({ result, onSelect }: { result: InspectionResult; onSelect: (r: InspectionResult) => void }) {
  const statusIcon = {
    processing: <Loader2 className="w-4 h-4 text-cyber-400 animate-spin" />,
    completed: <CheckCircle2 className="w-4 h-4 text-safe-500" />,
    failed: <XCircle className="w-4 h-4 text-danger-500" />,
  }

  const statusText = {
    processing: "识别中",
    completed: "已完成",
    failed: "识别失败",
  }

  return (
    <button
      onClick={() => onSelect(result)}
      className="glass-card p-4 text-left hover:glow-border transition-all duration-300 hover:scale-[1.01] w-full"
    >
      <div className="flex items-start gap-3">
        <div className="w-20 h-20 rounded-lg bg-navy-700/50 flex-shrink-0 overflow-hidden">
          {result.annotated_image_url ? (
            <img src={result.annotated_image_url} alt={result.filename} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileImage className="w-6 h-6 text-navy-600" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-slate-200 font-medium truncate">{result.filename}</p>
          <p className="text-xs text-navy-600 mt-1">{formatDateTime(result.created_at)}</p>
          <div className="flex items-center gap-2 mt-2">
            {statusIcon[result.status]}
            <span className="text-xs">{statusText[result.status]}</span>
          </div>
          {result.defects.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {result.defects.slice(0, 3).map((d, i) => (
                <span key={i} className={`text-[10px] px-1.5 py-0.5 rounded border ${severityColor(d.severity)}`}>
                  {defectTypeName(d.type || d.label)}
                </span>
              ))}
              {result.defects.length > 3 && (
                <span className="text-[10px] text-navy-600">+{result.defects.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </div>
    </button>
  )
}

function DetailPanel({ inspection }: { inspection: InspectionResult }) {
  return (
    <div className="glass-card p-6 animate-fade-in">
      <div className="flex items-center gap-2 mb-4">
        <Eye className="w-5 h-5 text-cyber-400" />
        <h3 className="text-sm font-semibold text-slate-200">识别详情</h3>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="aspect-video rounded-lg bg-navy-700/50 overflow-hidden border border-navy-700/50">
          {inspection.annotated_image_url ? (
            <img src={inspection.annotated_image_url} alt="标注图" className="w-full h-full object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <FileImage className="w-10 h-10 text-navy-600" />
            </div>
          )}
        </div>
        <div className="space-y-3">
          <div className="text-xs text-navy-600">文件名</div>
          <div className="text-sm text-slate-200">{inspection.filename}</div>
          <div className="text-xs text-navy-600 mt-3">识别时间</div>
          <div className="text-sm text-slate-200">{formatDateTime(inspection.created_at)}</div>
          <div className="text-xs text-navy-600 mt-3">检测到的缺陷</div>
          <div className="text-lg font-bold text-cyber-400">{inspection.defects.length}</div>
        </div>
      </div>

      {inspection.defects.length > 0 ? (
        <div>
          <h4 className="text-xs text-navy-600 mb-3 uppercase tracking-wider">缺陷列表</h4>
          <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
            {inspection.defects.map((defect, idx) => (
              <div key={idx} className="bg-navy-800/50 rounded-lg p-3 border border-navy-700/30">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-200 font-medium">{defectTypeName(defect.type || defect.label)}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full border ${severityColor(defect.severity)}`}>
                    {severityLabel(defect.severity)}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-navy-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyber-500 rounded-full transition-all duration-500"
                      style={{ width: `${defect.confidence * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-navy-600">{(defect.confidence * 100).toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center py-8 text-navy-600">
          <AlertTriangle className="w-8 h-8 mb-2" />
          <p className="text-sm">未检测到缺陷</p>
        </div>
      )}
    </div>
  )
}

export default function InspectionWorkbench() {
  const { inspections, currentInspection, setInspections, setCurrentInspection, setLoading } = useStore()
  const [uploading, setUploading] = useState(false)
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pollInspection = useCallback(
    (taskId: string, maxAttempts: number = 60) => {
      let attempts = 0
      const poll = async () => {
        if (attempts >= maxAttempts) {
          setUploading(false)
          setLoading(false)
          return
        }
        attempts++
        try {
          const inspection = await getInspection(taskId)
          if (inspection.status === "processing") {
            pollingRef.current = setTimeout(poll, 1500)
          } else {
            setInspections([inspection, ...inspections], inspections.length + 1)
            setCurrentInspection(inspection)
            setUploading(false)
            setLoading(false)
          }
        } catch {
          pollingRef.current = setTimeout(poll, 3000)
        }
      }
      poll()
    },
    [inspections, setInspections, setCurrentInspection, setLoading]
  )

  const handleUpload = useCallback(
    async (files: File[]) => {
      setUploading(true)
      setLoading(true)
      try {
        const result = await uploadImages(files)
        const taskId = result.task_id
        if (taskId) {
          pollInspection(taskId)
        }
      } catch {
        setUploading(false)
        setLoading(false)
      }
    },
    [pollInspection]
  )

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">巡检工作台</h2>
        <p className="text-sm text-navy-600 mt-1">上传巡检图片，AI 自动识别与分类缺陷</p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-1 space-y-4">
          <UploadZone onUpload={handleUpload} />

          {uploading && (
            <div className="glass-card p-4 flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-cyber-400 animate-spin" />
              <span className="text-sm text-slate-300">AI 识别处理中，请稍候...</span>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-xs text-navy-600 uppercase tracking-wider">识别历史</h3>
            {inspections.length === 0 ? (
              <div className="glass-card p-8 text-center text-navy-600">
                <FileImage className="w-8 h-8 mx-auto mb-2" />
                <p className="text-sm">暂无识别记录</p>
                <p className="text-xs mt-1">上传图片开始巡检</p>
              </div>
            ) : (
              inspections.map((insp) => (
                <ResultCard key={insp.id} result={insp} onSelect={setCurrentInspection} />
              ))
            )}
          </div>
        </div>

        <div className="col-span-2">
          {currentInspection ? (
            <DetailPanel inspection={currentInspection} />
          ) : (
            <div className="glass-card p-16 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-navy-700/30 flex items-center justify-center">
                <ScanSearchIcon className="w-10 h-10 text-navy-600" />
              </div>
              <p className="text-slate-300 font-medium">等待图片上传</p>
              <p className="text-navy-600 text-sm mt-1">上传巡检图片后，AI 识别结果将在此展示</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ScanSearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /><circle cx="12" cy="12" r="4" /><path d="m16 16 2 2" />
    </svg>
  )
}

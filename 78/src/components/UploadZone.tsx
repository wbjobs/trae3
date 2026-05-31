import { useState, useCallback, useRef } from 'react'
import { Upload, X, FileImage, FileText, Loader2 } from 'lucide-react'
import { useInvoiceStore } from '@/store/invoice'
import type { UploadResponse } from '@/types/invoice'

const statusConfig: Record<UploadResponse['status'], { label: string; cls: string }> = {
  pending: { label: '待识别', cls: 'bg-gray-100 text-gray-600' },
  processing: { label: '识别中', cls: 'bg-amber-100 text-amber-700 animate-pulse-amber' },
  completed: { label: '识别成功', cls: 'bg-mint-100 text-mint-500' },
  failed: { label: '识别失败', cls: 'bg-coral-100 text-coral-500' },
}

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

interface FileItem {
  file: File
  preview?: string
}

export default function UploadZone() {
  const [fileItems, setFileItems] = useState<FileItem[]>([])
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const { uploadFiles, uploadList, uploading } = useInvoiceStore()

  const acceptTypes = '.jpg,.jpeg,.png,.pdf'

  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => {
      const ext = f.name.split('.').pop()?.toLowerCase()
      return ['jpg', 'jpeg', 'png', 'pdf'].includes(ext || '')
    })
    const items: FileItem[] = arr.map((file) => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined,
    }))
    setFileItems((prev) => [...prev, ...items])
  }, [])

  const removeItem = useCallback((index: number) => {
    setFileItems((prev) => {
      const item = prev[index]
      if (item.preview) URL.revokeObjectURL(item.preview)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  const handleUpload = useCallback(() => {
    if (fileItems.length === 0) return
    const files = fileItems.map((f) => f.file)
    uploadFiles(files)
    fileItems.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview) })
    setFileItems([])
  }, [fileItems, uploadFiles])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files)
    },
    [addFiles],
  )

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? 'upload-zone-drag-over border-amber-500 bg-amber-500/5'
            : 'border-indigo-200 hover:border-indigo-400 bg-white'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptTypes}
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) addFiles(e.target.files) }}
        />
        <div className="flex flex-col items-center gap-3">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${dragOver ? 'bg-amber-100' : 'bg-indigo-100'}`}>
            <Upload size={24} className={dragOver ? 'text-amber-500' : 'text-indigo-700'} />
          </div>
          <div>
            <p className="text-sm font-medium text-indigo-800">拖拽文件到此处或点击上传</p>
            <p className="text-xs text-gray-400 mt-1">支持 JPG、PNG、PDF 格式，单文件最大 10MB</p>
          </div>
        </div>
      </div>

      {fileItems.length > 0 && (
        <div className="space-y-2 animate-slide-up">
          {fileItems.map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-indigo-100 card-hover">
              {item.preview ? (
                <img src={item.preview} alt="" className="w-10 h-10 object-cover rounded" />
              ) : (
                <div className="w-10 h-10 bg-coral-100 rounded flex items-center justify-center">
                  <FileText size={18} className="text-coral-500" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-indigo-800 truncate">{item.file.name}</p>
                <p className="text-xs text-gray-400 font-mono">{formatSize(item.file.size)}</p>
              </div>
              <button onClick={() => removeItem(idx)} className="p-1 rounded hover:bg-indigo-50 transition-colors">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
          ))}
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="w-full py-2.5 bg-indigo-900 text-white rounded-lg text-sm font-medium hover:bg-indigo-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? '上传中...' : `开始上传（${fileItems.length} 个文件）`}
          </button>
        </div>
      )}

      {uploadList.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-indigo-800">最近上传</h3>
          {uploadList.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3 bg-white rounded-lg border border-indigo-100 animate-fade-in">
              <div className="w-8 h-8 bg-indigo-50 rounded flex items-center justify-center">
                <FileImage size={16} className="text-indigo-700" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-indigo-800 truncate">{item.fileName}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusConfig[item.status].cls}`}>
                {statusConfig[item.status].label}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useNavigate } from 'react-router-dom'
import { useInvoiceStore } from '@/store/invoice'
import UploadZone from '@/components/UploadZone'
import { ChevronRight } from 'lucide-react'

export default function Upload() {
  const navigate = useNavigate()
  const uploadList = useInvoiceStore((s) => s.uploadList)

  return (
    <div className="p-8 max-w-3xl mx-auto animate-fade-in">
      <div className="mb-8">
        <h2 className="font-serif text-2xl font-semibold text-indigo-900">票据上传</h2>
        <p className="text-sm text-gray-400 mt-1">上传发票图片或 PDF，系统将自动识别票据信息</p>
      </div>

      <UploadZone />

      {uploadList.filter((u) => u.status === 'completed').length > 0 && (
        <div className="mt-6 space-y-2">
          <h3 className="text-sm font-semibold text-indigo-800">识别完成</h3>
          {uploadList
            .filter((u) => u.status === 'completed')
            .map((item) => (
              <button
                key={item.id}
                onClick={() => navigate(`/result/${item.id}`)}
                className="w-full flex items-center gap-3 p-3 bg-white rounded-lg border border-indigo-100 hover:border-amber-400 transition-colors text-left group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-indigo-800 truncate">{item.fileName}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-mint-100 text-mint-500">
                  识别成功
                </span>
                <ChevronRight size={16} className="text-gray-300 group-hover:text-amber-500 transition-colors" />
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

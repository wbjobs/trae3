import { useState } from 'react'
import { Send } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'
import { useApi } from '@/hooks/useApi'
import type { Annotation } from '../../../shared/types'

export default function AnnotationPanel() {
  const annotations = usePipelineStore((s) => s.annotations)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const currentUser = usePipelineStore((s) => s.currentUser)
  const addAnnotation = usePipelineStore((s) => s.addAnnotation)
  const api = useApi()

  const [input, setInput] = useState('')

  const pipeAnnotations = selectedPipeId
    ? annotations.filter((a) => a.pipeId === selectedPipeId)
    : annotations

  const handleSubmit = async () => {
    if (!input.trim() || !currentUser || !selectedPipeId) return

    const annotation: Annotation = {
      id: crypto.randomUUID(),
      pipeId: selectedPipeId,
      userId: currentUser.id,
      userName: currentUser.name,
      content: input.trim(),
      position: { x: 0, y: 0, z: 0 },
      timestamp: Date.now(),
    }

    try {
      await api.createAnnotation({
        pipeId: selectedPipeId,
        userId: currentUser.id,
        userName: currentUser.name,
        content: input.trim(),
        position: { x: 0, y: 0, z: 0 },
        timestamp: Date.now(),
      })
    } catch {
      // fallback to local
    }

    addAnnotation(annotation)
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <h3 className="text-xs font-medium text-[#e0e8f0]">
          标注 {selectedPipeId ? `(${pipeAnnotations.length})` : ''}
        </h3>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {pipeAnnotations.map((ann) => (
          <div key={ann.id} className="p-2 rounded bg-[#0a1628]/60 border border-[#1a3a5c]/30">
            <div className="flex items-center gap-1.5 mb-1">
              <div
                className="w-3.5 h-3.5 rounded-full flex items-center justify-center text-[7px] font-bold flex-shrink-0"
                style={{
                  backgroundColor: ann.userName === currentUser?.name ? '#00e5ff40' : '#ffa72640',
                  color: ann.userName === currentUser?.name ? '#00e5ff' : '#ffa726',
                }}
              >
                {ann.userName.charAt(ann.userName.length - 1)}
              </div>
              <span className="text-[10px] font-medium text-[#b0c4d8]">{ann.userName}</span>
              <span className="text-[9px] text-[#4a6a8a] ml-auto">
                {new Date(ann.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <p className="text-[10px] text-[#e0e8f0] leading-relaxed">{ann.content}</p>
          </div>
        ))}
        {pipeAnnotations.length === 0 && (
          <div className="text-center text-[10px] text-[#4a6a8a] py-4">
            暂无标注
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-[#1a3a5c]/50">
        <div className="flex gap-1.5">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder={selectedPipeId ? '输入标注内容...' : '请先选择管段'}
            disabled={!selectedPipeId}
            className="flex-1 h-7 px-2 text-[10px] bg-[#0a1628]/60 border border-[#1a3a5c]/50 rounded text-[#e0e8f0] placeholder-[#4a6a8a] outline-none focus:border-pipeline-cyan/50 disabled:opacity-40 transition-colors"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || !selectedPipeId}
            className="w-7 h-7 flex items-center justify-center rounded bg-pipeline-cyan/20 text-pipeline-cyan hover:bg-pipeline-cyan/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Send size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}

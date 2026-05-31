import { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronRight } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { PipeSegment } from '../../../shared/types'

const STATUS_DOT: Record<string, string> = {
  normal: 'bg-pipeline-ok',
  warning: 'bg-pipeline-warn',
  alarm: 'bg-pipeline-alarm animate-pulse-alarm',
}

export default function PipeTree() {
  const pipes = usePipelineStore((s) => s.pipes)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const selectPipe = usePipelineStore((s) => s.selectPipe)
  const [search, setSearch] = useState('')
  const [expandedAreas, setExpandedAreas] = useState<Set<string>>(new Set())

  const grouped = useMemo(() => {
    const map = new Map<string, PipeSegment[]>()
    const filtered = search
      ? pipes.filter((p) => p.name.includes(search) || p.areaId.includes(search))
      : pipes
    for (const pipe of filtered) {
      const area = pipe.areaId
      if (!map.has(area)) map.set(area, [])
      map.get(area)!.push(pipe)
    }
    return map
  }, [pipes, search])

  const toggleArea = (areaId: string) => {
    setExpandedAreas((prev) => {
      const next = new Set(prev)
      if (next.has(areaId)) next.delete(areaId)
      else next.add(areaId)
      return next
    })
  }

  const areas = useMemo(() => Array.from(grouped.keys()), [grouped])

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b border-[#1a3a5c]/50">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#7a8fa6]" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索管段..."
            className="w-full h-8 pl-8 pr-3 text-xs bg-[#0a1628]/60 border border-[#1a3a5c]/50 rounded text-[#e0e8f0] placeholder-[#7a8fa6] outline-none focus:border-pipeline-cyan/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {areas.map((areaId) => {
          const areaPipes = grouped.get(areaId) ?? []
          const isExpanded = expandedAreas.has(areaId)
          return (
            <div key={areaId} className="mb-1">
              <button
                onClick={() => toggleArea(areaId)}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-[#7a8fa6] hover:text-pipeline-cyan hover:bg-[#1a3a5c]/20 rounded transition-colors cursor-pointer"
              >
                {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <span>{areaId}</span>
                <span className="ml-auto text-[10px] text-[#4a6a8a]">{areaPipes.length}</span>
              </button>

              {isExpanded && (
                <div className="ml-3">
                  {areaPipes.map((pipe) => (
                    <button
                      key={pipe.id}
                      onClick={() => selectPipe(pipe.id)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded transition-colors cursor-pointer ${
                        selectedPipeId === pipe.id
                          ? 'bg-pipeline-cyan/10 text-pipeline-cyan'
                          : 'text-[#b0c4d8] hover:bg-[#1a3a5c]/20 hover:text-pipeline-cyan'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[pipe.status] ?? STATUS_DOT.normal}`} />
                      <span className="truncate">{pipe.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {areas.length === 0 && (
          <div className="text-center text-xs text-[#4a6a8a] py-8">
            {search ? '未找到匹配管段' : '暂无管段数据'}
          </div>
        )}
      </div>
    </div>
  )
}

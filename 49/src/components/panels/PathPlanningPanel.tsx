import { useState, useMemo, useCallback } from 'react'
import { X, MapPin, Navigation, Clock, Ruler, CircleDot, Save, RefreshCw, GripVertical, Trash2, Eye } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'
import { useApi } from '@/hooks/useApi'
import type { PlannedWaypoint, PipeNode, PathPlanningParams } from '../../../shared/types'

type PlanningMode = 'area' | 'nodes' | 'shortest'

export default function PathPlanningPanel() {
  const nodes = usePipelineStore((s) => s.nodes)
  const pipes = usePipelineStore((s) => s.pipes)
  const plannedPath = usePipelineStore((s) => s.plannedPath)
  const setPlannedPath = usePipelineStore((s) => s.setPlannedPath)
  const setShowPathPlanning = usePipelineStore((s) => s.setShowPathPlanning)
  const api = useApi()

  const [mode, setMode] = useState<PlanningMode>('nodes')
  const [selectedAreaId, setSelectedAreaId] = useState('')
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([])
  const [startNodeId, setStartNodeId] = useState('')
  const [endNodeId, setEndNodeId] = useState('')
  const [isPlanning, setIsPlanning] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [pathName, setPathName] = useState('')
  const [isPreviewing, setIsPreviewing] = useState(false)

  const areas = useMemo(() => {
    const areaSet = new Map<string, string>()
    for (const node of nodes) {
      if (!areaSet.has(node.areaId)) {
        areaSet.set(node.areaId, node.areaId)
      }
    }
    return Array.from(areaSet.entries()).map(([id, name]) => ({ id, name }))
  }, [nodes])

  const selectedNodes = useMemo(
    () => selectedNodeIds.map((id) => nodes.find((n) => n.id === id)).filter(Boolean) as PipeNode[],
    [selectedNodeIds, nodes]
  )

  const waypoints: PlannedWaypoint[] = useMemo(
    () => selectedNodes.map((node, index) => ({
      id: `wp-${node.id}`,
      nodeId: node.id,
      position: node.position,
      order: index,
      stayDuration: 30,
    })),
    [selectedNodes]
  )

  const toggleNode = useCallback((nodeId: string) => {
    setSelectedNodeIds((prev) =>
      prev.includes(nodeId) ? prev.filter((id) => id !== nodeId) : [...prev, nodeId]
    )
  }, [])

  const handlePlanPath = useCallback(async () => {
    let params: PathPlanningParams = {}
    if (mode === 'area') {
      if (!selectedAreaId) return
      params = { areaId: selectedAreaId }
    } else if (mode === 'nodes') {
      if (selectedNodeIds.length < 2) return
      params = { nodeIds: selectedNodeIds }
    } else if (mode === 'shortest') {
      if (!startNodeId || !endNodeId) return
      params = { startNodeId, endNodeId }
    }
    setIsPlanning(true)
    try {
      const result = await api.planPath(params)
      setPlannedPath(result)
    } finally {
      setIsPlanning(false)
    }
  }, [mode, selectedAreaId, selectedNodeIds, startNodeId, endNodeId, api, setPlannedPath])

  const savePath = useCallback(async () => {
    if (!plannedPath || !pathName.trim()) return
    try {
      await api.createInspection({
        name: pathName,
        waypoints: plannedPath.waypoints.map((wp) => ({
          id: wp.id,
          pipeId: wp.nodeId,
          position: wp.position,
          stayDuration: wp.stayDuration,
        })),
        createdBy: 'user',
      })
      setPathName('')
    } catch {}
  }, [plannedPath, pathName, api])

  const clearAll = useCallback(() => {
    setSelectedNodeIds([])
    setStartNodeId('')
    setEndNodeId('')
    setSelectedAreaId('')
    setPlannedPath(null)
    setIsPreviewing(false)
  }, [setPlannedPath])

  const handleDragStart = (index: number) => setDraggedIndex(index)
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    if (draggedIndex === null || draggedIndex === index) return
    const newOrder = [...selectedNodeIds]
    const [removed] = newOrder.splice(draggedIndex, 1)
    newOrder.splice(index, 0, removed)
    setSelectedNodeIds(newOrder)
    setDraggedIndex(index)
  }
  const handleDragEnd = () => setDraggedIndex(null)
  const removeWaypoint = (index: number) => {
    setSelectedNodeIds((prev) => prev.filter((_, i) => i !== index))
  }

  const displayWaypoints = plannedPath?.waypoints ?? waypoints

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a3a5c]/50">
        <h3 className="text-xs font-medium text-[#e0e8f0]">路径规划</h3>
        <button
          onClick={() => setShowPathPlanning(false)}
          className="w-5 h-5 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] cursor-pointer"
        >
          <X size={12} />
        </button>
      </div>

      <div className="px-3 py-2 border-b border-[#1a3a5c]/50 flex gap-1">
        {([
          { key: 'area' as const, label: '按区域规划' },
          { key: 'nodes' as const, label: '按节点规划' },
          { key: 'shortest' as const, label: '最短路径' },
        ]).map((m) => (
          <button
            key={m.key}
            onClick={() => { setMode(m.key); clearAll() }}
            className={`flex-1 py-1 text-[9px] rounded transition-colors cursor-pointer ${
              mode === m.key
                ? 'bg-pipeline-cyan/20 text-pipeline-cyan'
                : 'bg-[#1a3a5c]/30 text-[#7a8fa6] hover:bg-[#1a3a5c]/50 hover:text-[#e0e8f0]'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        {mode === 'area' && (
          <div className="space-y-2">
            <select
              value={selectedAreaId}
              onChange={(e) => setSelectedAreaId(e.target.value)}
              className="w-full h-7 px-2 text-[10px] bg-[#1a3a5c]/30 border border-[#1a3a5c]/50 rounded text-[#e0e8f0] focus:outline-none focus:border-pipeline-cyan/50 cursor-pointer"
            >
              <option value="">选择区域</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <button
              onClick={handlePlanPath}
              disabled={!selectedAreaId || isPlanning}
              className="w-full h-7 flex items-center justify-center gap-1.5 text-[10px] text-pipeline-cyan bg-pipeline-cyan/10 rounded hover:bg-pipeline-cyan/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPlanning ? <RefreshCw size={12} className="animate-spin" /> : <Navigation size={12} />}
              生成路径
            </button>
          </div>
        )}

        {mode === 'nodes' && (
          <div className="space-y-2">
            <div className="max-h-[120px] overflow-y-auto space-y-1">
              {nodes.map((node) => (
                <button
                  key={node.id}
                  onClick={() => toggleNode(node.id)}
                  className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-[10px] text-left cursor-pointer transition-colors ${
                    selectedNodeIds.includes(node.id)
                      ? 'bg-pipeline-cyan/20 text-pipeline-cyan'
                      : 'bg-[#1a3a5c]/30 text-[#b0c4d8] hover:bg-[#1a3a5c]/50'
                  }`}
                >
                  <MapPin size={10} />
                  <span className="flex-1 truncate">{node.name}</span>
                  {selectedNodeIds.includes(node.id) && (
                    <span className="text-[9px] font-bold">#{selectedNodeIds.indexOf(node.id) + 1}</span>
                  )}
                </button>
              ))}
            </div>
            <button
              onClick={handlePlanPath}
              disabled={selectedNodeIds.length < 2 || isPlanning}
              className="w-full h-7 flex items-center justify-center gap-1.5 text-[10px] text-pipeline-cyan bg-pipeline-cyan/10 rounded hover:bg-pipeline-cyan/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPlanning ? <RefreshCw size={12} className="animate-spin" /> : <Navigation size={12} />}
              生成路径
            </button>
          </div>
        )}

        {mode === 'shortest' && (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <select
                value={startNodeId}
                onChange={(e) => setStartNodeId(e.target.value)}
                className="w-full h-7 px-2 text-[10px] bg-[#1a3a5c]/30 border border-[#1a3a5c]/50 rounded text-[#e0e8f0] focus:outline-none focus:border-pipeline-cyan/50 cursor-pointer"
              >
                <option value="">选择起点</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
              <select
                value={endNodeId}
                onChange={(e) => setEndNodeId(e.target.value)}
                className="w-full h-7 px-2 text-[10px] bg-[#1a3a5c]/30 border border-[#1a3a5c]/50 rounded text-[#e0e8f0] focus:outline-none focus:border-pipeline-cyan/50 cursor-pointer"
              >
                <option value="">选择终点</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={handlePlanPath}
              disabled={!startNodeId || !endNodeId || isPlanning}
              className="w-full h-7 flex items-center justify-center gap-1.5 text-[10px] text-pipeline-cyan bg-pipeline-cyan/10 rounded hover:bg-pipeline-cyan/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPlanning ? <RefreshCw size={12} className="animate-spin" /> : <Navigation size={12} />}
              规划
            </button>
          </div>
        )}
      </div>

      {plannedPath && (
        <>
          <div className="px-3 py-2 border-b border-[#1a3a5c]/50 grid grid-cols-3 gap-2">
            <div className="bg-[#1a3a5c]/30 rounded p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[#7a8fa6] mb-0.5">
                <Ruler size={10} />
                <span className="text-[8px]">总距离</span>
              </div>
              <div className="text-xs font-mono text-pipeline-cyan">{plannedPath.totalDistance}m</div>
            </div>
            <div className="bg-[#1a3a5c]/30 rounded p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[#7a8fa6] mb-0.5">
                <Clock size={10} />
                <span className="text-[8px]">预计时长</span>
              </div>
              <div className="text-xs font-mono text-pipeline-warn">{plannedPath.estimatedDuration}min</div>
            </div>
            <div className="bg-[#1a3a5c]/30 rounded p-2 text-center">
              <div className="flex items-center justify-center gap-1 text-[#7a8fa6] mb-0.5">
                <CircleDot size={10} />
                <span className="text-[8px]">管段数</span>
              </div>
              <div className="text-xs font-mono text-pipeline-ok">{plannedPath.pipeCount}</div>
            </div>
          </div>

          <div className="px-3 py-2 border-b border-[#1a3a5c]/50 flex-1 overflow-hidden flex flex-col">
            <h4 className="text-[10px] font-medium text-[#7a8fa6] mb-1.5 flex-shrink-0">路径点位 ({displayWaypoints.length})</h4>
            <div className="flex-1 overflow-y-auto space-y-1">
              {displayWaypoints.map((wp, i) => (
                <div
                  key={wp.id}
                  draggable={mode === 'nodes'}
                  onDragStart={() => handleDragStart(i)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-[10px] transition-colors ${
                    draggedIndex === i ? 'bg-pipeline-cyan/20' : 'bg-[#1a3a5c]/30 hover:bg-[#1a3a5c]/50'
                  } ${mode === 'nodes' ? 'cursor-move' : ''}`}
                >
                  {mode === 'nodes' && <GripVertical size={10} className="text-[#4a6a8a]" />}
                  <span className="w-5 h-5 flex items-center justify-center bg-pipeline-cyan/20 text-pipeline-cyan rounded-full text-[9px] font-bold">
                    {i + 1}
                  </span>
                  <MapPin size={10} className="text-[#7a8fa6]" />
                  <span className="flex-1 text-[#b0c4d8] truncate">{nodes.find((n) => n.id === wp.nodeId)?.name ?? wp.nodeId}</span>
                  {mode === 'nodes' && (
                    <button
                      onClick={() => removeWaypoint(i)}
                      className="w-4 h-4 flex items-center justify-center text-[#4a6a8a] hover:text-pipeline-alarm cursor-pointer"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="px-3 py-2 border-t border-[#1a3a5c]/50 space-y-2">
            <div className="flex gap-2">
              <button
                onClick={() => setIsPreviewing(!isPreviewing)}
                className={`flex-1 h-7 flex items-center justify-center gap-1.5 text-[10px] rounded transition-colors cursor-pointer ${
                  isPreviewing
                    ? 'text-pipeline-ok bg-pipeline-ok/20'
                    : 'text-pipeline-cyan bg-pipeline-cyan/10 hover:bg-pipeline-cyan/20'
                }`}
              >
                <Eye size={12} />
                {isPreviewing ? '关闭预览' : '预览'}
              </button>
              <button
                onClick={clearAll}
                className="h-7 px-3 flex items-center gap-1 text-[10px] text-pipeline-alarm bg-pipeline-alarm/10 rounded hover:bg-pipeline-alarm/20 transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={pathName}
                onChange={(e) => setPathName(e.target.value)}
                placeholder="输入路径名称"
                className="flex-1 h-7 px-2 text-[10px] bg-[#1a3a5c]/30 border border-[#1a3a5c]/50 rounded text-[#e0e8f0] focus:outline-none focus:border-pipeline-cyan/50 placeholder-[#4a6a8a]"
              />
              <button
                onClick={savePath}
                disabled={!pathName.trim()}
                className="h-7 px-3 flex items-center gap-1 text-[10px] text-pipeline-ok bg-pipeline-ok/10 rounded hover:bg-pipeline-ok/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={12} />
                保存
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

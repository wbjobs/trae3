import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Square, SkipBack, SkipForward, Route } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'

const SPEED_OPTIONS = [0.5, 1, 2] as const

export default function InspectionPanel() {
  const inspectionPaths = usePipelineStore((s) => s.inspectionPaths)
  const togglePathPlanning = usePipelineStore((s) => s.togglePathPlanning)
  const showPathPlanning = usePipelineStore((s) => s.showPathPlanning)
  const [selectedPathId, setSelectedPathId] = useState<string | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [speed, setSpeed] = useState<0.5 | 1 | 2>(1)
  const [currentWaypointIndex, setCurrentWaypointIndex] = useState(0)
  const animRef = useRef<number | null>(null)
  const lastTimeRef = useRef(0)

  const selectedPath = inspectionPaths.find((p) => p.id === selectedPathId)

  const handlePlay = useCallback(() => {
    if (!selectedPath) return
    setIsPlaying(true)
    lastTimeRef.current = performance.now()
  }, [selectedPath])

  const handlePause = useCallback(() => {
    setIsPlaying(false)
    if (animRef.current) cancelAnimationFrame(animRef.current)
  }, [])

  const handleStop = useCallback(() => {
    setIsPlaying(false)
    setProgress(0)
    setCurrentWaypointIndex(0)
    if (animRef.current) cancelAnimationFrame(animRef.current)
  }, [])

  useEffect(() => {
    if (!isPlaying || !selectedPath) return

    const totalWaypoints = selectedPath.waypoints.length
    if (totalWaypoints < 2) return

    const animate = (time: number) => {
      const delta = (time - lastTimeRef.current) / 1000
      lastTimeRef.current = time
      setProgress((prev) => {
        const next = prev + (delta * speed) / totalWaypoints
        if (next >= 1) {
          setIsPlaying(false)
          return 1
        }
        return next
      })
      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [isPlaying, selectedPath, speed])

  useEffect(() => {
    if (!selectedPath) return
    const idx = Math.floor(progress * (selectedPath.waypoints.length - 1))
    setCurrentWaypointIndex(Math.min(idx, selectedPath.waypoints.length - 1))
  }, [progress, selectedPath])

  const currentWaypoint = selectedPath?.waypoints[currentWaypointIndex]

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-[#1a3a5c]/50">
        <h3 className="text-xs font-medium text-[#e0e8f0]">巡检控制</h3>
      </div>

      <div className="px-3 py-2 space-y-2 border-b border-[#1a3a5c]/50">
        <h4 className="text-[10px] text-[#7a8fa6]">巡检路径</h4>
        <div className="space-y-1 max-h-[160px] overflow-y-auto">
          {inspectionPaths.map((path) => (
            <button
              key={path.id}
              onClick={() => {
                setSelectedPathId(path.id)
                setProgress(0)
                setIsPlaying(false)
                setCurrentWaypointIndex(0)
              }}
              className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors cursor-pointer ${
                selectedPathId === path.id
                  ? 'bg-pipeline-cyan/10 text-pipeline-cyan'
                  : 'text-[#b0c4d8] hover:bg-[#1a3a5c]/20'
              }`}
            >
              {path.name}
              <span className="text-[#4a6a8a] ml-1">({path.waypoints.length}个点位)</span>
            </button>
          ))}
          {inspectionPaths.length === 0 && (
            <span className="text-[10px] text-[#4a6a8a]">暂无巡检路径</span>
          )}
        </div>
        <button
          onClick={togglePathPlanning}
          className={`w-full h-7 flex items-center justify-center gap-1.5 text-[10px] rounded transition-colors cursor-pointer ${
            showPathPlanning
              ? 'text-pipeline-cyan bg-pipeline-cyan/20'
              : 'text-pipeline-cyan bg-pipeline-cyan/10 hover:bg-pipeline-cyan/20'
          }`}
        >
          <Route size={12} />
          {showPathPlanning ? '关闭路径规划' : '规划新路径'}
        </button>
      </div>

      {selectedPath && (
        <>
          <div className="px-3 py-3 flex items-center justify-center gap-3">
            <button
              onClick={handleStop}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a3a5c]/30 text-[#7a8fa6] hover:bg-[#1a3a5c]/50 hover:text-[#e0e8f0] transition-colors cursor-pointer"
            >
              <Square size={14} />
            </button>
            <button
              onClick={() => {
                const newProgress = Math.max(0, progress - 1 / selectedPath.waypoints.length)
                setProgress(newProgress)
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a3a5c]/30 text-[#7a8fa6] hover:bg-[#1a3a5c]/50 hover:text-[#e0e8f0] transition-colors cursor-pointer"
            >
              <SkipBack size={14} />
            </button>
            <button
              onClick={isPlaying ? handlePause : handlePlay}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-pipeline-cyan/20 text-pipeline-cyan hover:bg-pipeline-cyan/30 transition-colors cursor-pointer"
            >
              {isPlaying ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button
              onClick={() => {
                const newProgress = Math.min(1, progress + 1 / selectedPath.waypoints.length)
                setProgress(newProgress)
              }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-[#1a3a5c]/30 text-[#7a8fa6] hover:bg-[#1a3a5c]/50 hover:text-[#e0e8f0] transition-colors cursor-pointer"
            >
              <SkipForward size={14} />
            </button>
          </div>

          <div className="px-3 py-1">
            <div className="relative h-1.5 bg-[#1a3a5c]/50 rounded-full overflow-hidden">
              <div
                className="absolute left-0 top-0 h-full bg-pipeline-cyan rounded-full transition-all duration-100"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <div className="flex justify-between mt-1 text-[9px] text-[#4a6a8a]">
              <span>{Math.round(progress * 100)}%</span>
              <span>{currentWaypointIndex + 1}/{selectedPath.waypoints.length}</span>
            </div>
          </div>

          <div className="px-3 py-2 border-t border-[#1a3a5c]/50">
            <h4 className="text-[10px] text-[#7a8fa6] mb-1.5">当前点位</h4>
            {currentWaypoint ? (
              <div className="text-[10px] text-[#e0e8f0] space-y-0.5">
                <div>管段: {currentWaypoint.pipeId}</div>
                <div>位置: ({currentWaypoint.position.x.toFixed(1)}, {currentWaypoint.position.y.toFixed(1)}, {currentWaypoint.position.z.toFixed(1)})</div>
                <div>停留: {currentWaypoint.stayDuration}s</div>
              </div>
            ) : (
              <span className="text-[10px] text-[#4a6a8a]">--</span>
            )}
          </div>

          <div className="px-3 py-2 border-t border-[#1a3a5c]/50">
            <h4 className="text-[10px] text-[#7a8fa6] mb-1.5">播放速度</h4>
            <div className="flex gap-1">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  className={`flex-1 py-1 text-[10px] rounded cursor-pointer transition-colors ${
                    speed === s
                      ? 'bg-pipeline-cyan/20 text-pipeline-cyan'
                      : 'bg-[#1a3a5c]/30 text-[#7a8fa6] hover:text-[#b0c4d8]'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

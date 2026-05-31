import { useEffect, useState, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import AppLayout from '@/components/layout/AppLayout'
import PipeTree from '@/components/layout/PipeTree'
import PipeDetailPanel from '@/components/panels/PipeDetailPanel'
import CrossSectionPanel from '@/components/panels/CrossSectionPanel'
import AlarmBar from '@/components/layout/AlarmBar'
import PipeNetwork from '@/components/scene/PipeNetwork'
import PipeNodes from '@/components/scene/PipeNodes'
import GroundGrid from '@/components/scene/GroundGrid'
import SceneLights from '@/components/scene/SceneLights'
import SceneCamera from '@/components/scene/SceneCamera'
import PipeLabels from '@/components/scene/PipeLabels'
import PerformanceMonitor from '@/components/scene/PerformanceMonitor'
import CrossSectionView from '@/components/scene/CrossSectionView'
import PipeCrossSectionMarker from '@/components/scene/PipeCrossSectionMarker'
import PlannedPathVisualization from '@/components/scene/PlannedPathVisualization'
import { usePipelineStore } from '@/store/usePipelineStore'
import { useApi } from '@/hooks/useApi'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { AlarmRecord } from '../../shared/types'

export default function ScenePage() {
  const fetchPipes = usePipelineStore((s) => s.fetchPipes)
  const fetchNodes = usePipelineStore((s) => s.fetchNodes)
  const fetchAlarms = usePipelineStore((s) => s.fetchAlarms)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const showCrossSection = usePipelineStore((s) => s.showCrossSection)
  const api = useApi()
  const { connected } = useWebSocket()
  const [selectedAlarm, setSelectedAlarm] = useState<AlarmRecord | null>(null)
  const [showCrossSectionTab, setShowCrossSectionTab] = useState(false)

  useEffect(() => {
    fetchPipes()
    fetchNodes()
    fetchAlarms(false)
  }, [fetchPipes, fetchNodes, fetchAlarms])

  useEffect(() => {
    if (showCrossSection) {
      setShowCrossSectionTab(true)
    }
  }, [showCrossSection])

  const rightPanelContent = useMemo(() => {
    if (!selectedPipeId) return undefined
    if (showCrossSection && showCrossSectionTab) {
      return <CrossSectionPanel />
    }
    return <PipeDetailPanel />
  }, [selectedPipeId, showCrossSection, showCrossSectionTab])

  const rightPanelWithTabs = useMemo(() => {
    if (!selectedPipeId) return undefined
    return (
      <div className="flex flex-col h-full">
        {showCrossSection && (
          <div className="flex border-b border-[#1a3a5c]/50">
            <button
              onClick={() => setShowCrossSectionTab(false)}
              className={`flex-1 py-2 text-[10px] text-center cursor-pointer transition-colors ${
                !showCrossSectionTab ? 'text-pipeline-cyan border-b border-pipeline-cyan' : 'text-[#7a8fa6]'
              }`}
            >
              管段详情
            </button>
            <button
              onClick={() => setShowCrossSectionTab(true)}
              className={`flex-1 py-2 text-[10px] text-center cursor-pointer transition-colors ${
                showCrossSectionTab ? 'text-pipeline-cyan border-b border-pipeline-cyan' : 'text-[#7a8fa6]'
              }`}
            >
              剖面分析
            </button>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {rightPanelContent}
        </div>
      </div>
    )
  }, [selectedPipeId, showCrossSection, showCrossSectionTab, rightPanelContent])

  return (
    <AppLayout
      leftSidebar={<PipeTree />}
      rightPanel={rightPanelWithTabs}
      bottomBar={<AlarmBar onAlarmClick={setSelectedAlarm} />}
    >
      <Canvas
        shadows
        camera={{ fov: 60, position: [25, 20, 25], near: 0.1, far: 200 }}
        style={{ background: '#050d1a' }}
      >
        <SceneCamera />
        <SceneLights />
        <GroundGrid />
        <PipeNetwork />
        <PipeNodes />
        <PipeLabels />
        <PerformanceMonitor />
        <CrossSectionView />
        <PipeCrossSectionMarker />
        <PlannedPathVisualization />
      </Canvas>
    </AppLayout>
  )
}

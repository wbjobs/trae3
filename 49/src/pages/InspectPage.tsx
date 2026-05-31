import { useEffect, useState, useMemo } from 'react'
import { Canvas } from '@react-three/fiber'
import AppLayout from '@/components/layout/AppLayout'
import PipeTree from '@/components/layout/PipeTree'
import InspectionPanel from '@/components/panels/InspectionPanel'
import PathPlanningPanel from '@/components/panels/PathPlanningPanel'
import CrossSectionPanel from '@/components/panels/CrossSectionPanel'
import PipeDetailPanel from '@/components/panels/PipeDetailPanel'
import AlarmBar from '@/components/layout/AlarmBar'
import PipeNetwork from '@/components/scene/PipeNetwork'
import PipeNodes from '@/components/scene/PipeNodes'
import GroundGrid from '@/components/scene/GroundGrid'
import SceneLights from '@/components/scene/SceneLights'
import SceneCamera from '@/components/scene/SceneCamera'
import RealtimeLabel from '@/components/scene/RealtimeLabel'
import AlarmMarker from '@/components/scene/AlarmMarker'
import InspectionFlyPath from '@/components/scene/InspectionFlyPath'
import CrossSectionView from '@/components/scene/CrossSectionView'
import PipeCrossSectionMarker from '@/components/scene/PipeCrossSectionMarker'
import PlannedPathOverlay from '@/components/scene/PlannedPathOverlay'
import PlannedPathVisualization from '@/components/scene/PlannedPathVisualization'
import { usePipelineStore } from '@/store/usePipelineStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { AlarmRecord } from '../../shared/types'

type RightTab = 'inspection' | 'planning' | 'detail' | 'crossSection'

export default function InspectPage() {
  const fetchPipes = usePipelineStore((s) => s.fetchPipes)
  const fetchNodes = usePipelineStore((s) => s.fetchNodes)
  const fetchAlarms = usePipelineStore((s) => s.fetchAlarms)
  const fetchInspectionPaths = usePipelineStore((s) => s.fetchInspectionPaths)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const showCrossSection = usePipelineStore((s) => s.showCrossSection)
  const showPathPlanning = usePipelineStore((s) => s.showPathPlanning)
  const { connected } = useWebSocket()
  const [selectedAlarm, setSelectedAlarm] = useState<AlarmRecord | null>(null)
  const [activeTab, setActiveTab] = useState<RightTab>('inspection')

  useEffect(() => {
    fetchPipes()
    fetchNodes()
    fetchAlarms(false)
    fetchInspectionPaths()
  }, [fetchPipes, fetchNodes, fetchAlarms, fetchInspectionPaths])

  useEffect(() => {
    if (showPathPlanning) {
      setActiveTab('planning')
    }
  }, [showPathPlanning])

  useEffect(() => {
    if (showCrossSection) {
      setActiveTab('crossSection')
    }
  }, [showCrossSection])

  useEffect(() => {
    if (selectedPipeId && !showCrossSection && !showPathPlanning) {
      setActiveTab('detail')
    } else if (!selectedPipeId && !showPathPlanning && !showCrossSection) {
      setActiveTab('inspection')
    }
  }, [selectedPipeId, showCrossSection, showPathPlanning])

  const rightPanelContent = useMemo(() => {
    switch (activeTab) {
      case 'planning':
        return <PathPlanningPanel />
      case 'crossSection':
        return <CrossSectionPanel />
      case 'detail':
        return <PipeDetailPanel />
      default:
        return <InspectionPanel />
    }
  }, [activeTab])

  const showTabs = selectedPipeId || showPathPlanning || showCrossSection

  const rightPanelWithTabs = useMemo(() => (
    <div className="flex flex-col h-full">
      {showTabs && (
        <div className="flex border-b border-[#1a3a5c]/50">
          <button
            onClick={() => setActiveTab('inspection')}
            className={`flex-1 py-2 text-[10px] text-center cursor-pointer transition-colors ${
              activeTab === 'inspection' ? 'text-pipeline-cyan border-b border-pipeline-cyan' : 'text-[#7a8fa6]'
            }`}
          >
            巡检控制
          </button>
          {selectedPipeId && (
            <button
              onClick={() => setActiveTab('detail')}
              className={`flex-1 py-2 text-[10px] text-center cursor-pointer transition-colors ${
                activeTab === 'detail' ? 'text-pipeline-cyan border-b border-pipeline-cyan' : 'text-[#7a8fa6]'
              }`}
            >
              管段详情
            </button>
          )}
          {showCrossSection && (
            <button
              onClick={() => setActiveTab('crossSection')}
              className={`flex-1 py-2 text-[10px] text-center cursor-pointer transition-colors ${
                activeTab === 'crossSection' ? 'text-pipeline-cyan border-b border-pipeline-cyan' : 'text-[#7a8fa6]'
              }`}
            >
              剖面分析
            </button>
          )}
          <button
            onClick={() => setActiveTab('planning')}
            className={`flex-1 py-2 text-[10px] text-center cursor-pointer transition-colors ${
              activeTab === 'planning' ? 'text-pipeline-cyan border-b border-pipeline-cyan' : 'text-[#7a8fa6]'
            }`}
          >
            路径规划
          </button>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        {rightPanelContent}
      </div>
    </div>
  ), [activeTab, showTabs, selectedPipeId, showCrossSection, rightPanelContent])

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
        <RealtimeLabel />
        <AlarmMarker />
        <InspectionFlyPath />
        <CrossSectionView />
        <PipeCrossSectionMarker />
        <PlannedPathOverlay />
        <PlannedPathVisualization />
      </Canvas>
    </AppLayout>
  )
}

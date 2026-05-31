import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AppLayout from '@/components/layout/AppLayout'
import PipeTree from '@/components/layout/PipeTree'
import CollabPanel from '@/components/panels/CollabPanel'
import AnnotationPanel from '@/components/panels/AnnotationPanel'
import PipeNetwork from '@/components/scene/PipeNetwork'
import PipeNodes from '@/components/scene/PipeNodes'
import GroundGrid from '@/components/scene/GroundGrid'
import SceneLights from '@/components/scene/SceneLights'
import SceneCamera from '@/components/scene/SceneCamera'
import CollabCursor from '@/components/scene/CollabCursor'
import { usePipelineStore } from '@/store/usePipelineStore'
import { useWebSocket } from '@/hooks/useWebSocket'

export default function CollabPage() {
  const fetchPipes = usePipelineStore((s) => s.fetchPipes)
  const fetchNodes = usePipelineStore((s) => s.fetchNodes)
  const fetchAnnotations = usePipelineStore((s) => s.fetchAnnotations)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const { connected } = useWebSocket()
  const [showAnnotations, setShowAnnotations] = useState(true)

  useEffect(() => {
    fetchPipes()
    fetchNodes()
  }, [fetchPipes, fetchNodes])

  useEffect(() => {
    if (selectedPipeId) {
      fetchAnnotations(selectedPipeId)
    }
  }, [selectedPipeId, fetchAnnotations])

  const rightPanelContent = (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-[#1a3a5c]/50">
        <button
          onClick={() => setShowAnnotations(true)}
          className={`flex-1 py-2 text-[10px] text-center cursor-pointer transition-colors ${
            showAnnotations ? 'text-pipeline-cyan border-b border-pipeline-cyan' : 'text-[#7a8fa6]'
          }`}
        >
          标注
        </button>
        <button
          onClick={() => setShowAnnotations(false)}
          className={`flex-1 py-2 text-[10px] text-center cursor-pointer transition-colors ${
            !showAnnotations ? 'text-pipeline-cyan border-b border-pipeline-cyan' : 'text-[#7a8fa6]'
          }`}
        >
          协作
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {showAnnotations ? <AnnotationPanel /> : <CollabPanel />}
      </div>
    </div>
  )

  return (
    <AppLayout
      leftSidebar={<PipeTree />}
      rightPanel={rightPanelContent}
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
        <CollabCursor />
      </Canvas>
    </AppLayout>
  )
}

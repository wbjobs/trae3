import { useEffect, useState } from 'react'
import { Canvas } from '@react-three/fiber'
import AppLayout from '@/components/layout/AppLayout'
import PipeTree from '@/components/layout/PipeTree'
import MonitorPanel from '@/components/panels/MonitorPanel'
import AlarmBar from '@/components/layout/AlarmBar'
import AlarmDetailModal from '@/components/panels/AlarmDetailModal'
import PipeNetwork from '@/components/scene/PipeNetwork'
import PipeNodes from '@/components/scene/PipeNodes'
import GroundGrid from '@/components/scene/GroundGrid'
import SceneLights from '@/components/scene/SceneLights'
import SceneCamera from '@/components/scene/SceneCamera'
import RealtimeLabel from '@/components/scene/RealtimeLabel'
import AlarmMarker from '@/components/scene/AlarmMarker'
import { usePipelineStore } from '@/store/usePipelineStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { AlarmRecord } from '../../shared/types'

export default function MonitorPage() {
  const fetchPipes = usePipelineStore((s) => s.fetchPipes)
  const fetchNodes = usePipelineStore((s) => s.fetchNodes)
  const fetchAlarms = usePipelineStore((s) => s.fetchAlarms)
  const { connected } = useWebSocket()
  const [selectedAlarm, setSelectedAlarm] = useState<AlarmRecord | null>(null)

  useEffect(() => {
    fetchPipes()
    fetchNodes()
    fetchAlarms(false)
  }, [fetchPipes, fetchNodes, fetchAlarms])

  return (
    <>
      <AppLayout
        leftSidebar={<PipeTree />}
        rightPanel={<MonitorPanel onAlarmClick={setSelectedAlarm} />}
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
        </Canvas>
      </AppLayout>

      <AlarmDetailModal
        alarm={selectedAlarm}
        onClose={() => setSelectedAlarm(null)}
      />
    </>
  )
}

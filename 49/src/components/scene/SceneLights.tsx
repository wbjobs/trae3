import { useMemo } from 'react'
import * as THREE from 'three'
import { EffectComposer, SSAO, FXAA } from '@react-three/postprocessing'
import { usePipelineStore } from '@/store/usePipelineStore'

export default function SceneLights() {
  const nodes = usePipelineStore((s) => s.nodes)
  const performanceMode = usePipelineStore((s) => s.performanceMode)

  const pumpNodes = useMemo(() => {
    return nodes.filter((n) => n.type === 'pump').slice(0, 4)
  }, [nodes])

  return (
    <>
      <directionalLight
        color="#c8e6ff"
        intensity={0.8}
        position={[20, 30, 10]}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={80}
        shadow-camera-left={-40}
        shadow-camera-right={40}
        shadow-camera-top={40}
        shadow-camera-bottom={-40}
      />
      <ambientLight color="#0a1628" intensity={0.3} />
      {pumpNodes.map((node) => (
        <pointLight
          key={node.id}
          color="#00e5ff"
          intensity={0.5}
          distance={15}
          position={[node.position.x, node.position.y + 2, node.position.z]}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
      ))}
      <EffectComposer enabled={!performanceMode}>
        <SSAO
          intensity={0.15}
          luminanceInfluence={0.5}
          color={new THREE.Color('black')}
          worldDistanceThreshold={10}
          worldDistanceFalloff={5}
          worldProximityThreshold={0.5}
          worldProximityFalloff={0.1}
        />
        <FXAA />
      </EffectComposer>
    </>
  )
}

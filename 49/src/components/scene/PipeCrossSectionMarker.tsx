import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'

export default function PipeCrossSectionMarker() {
  const showCrossSection = usePipelineStore((s) => s.showCrossSection)
  const crossSectionData = usePipelineStore((s) => s.crossSectionData)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const pipes = usePipelineStore((s) => s.pipes)
  const nodes = usePipelineStore((s) => s.nodes)

  const groupRef = useRef<THREE.Group>(null)

  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.5
    }
  })

  const position = useMemo(() => {
    if (!selectedPipeId) return null
    const pipe = pipes.find((p) => p.id === selectedPipeId)
    if (!pipe) return null
    const startNode = nodes.find((n) => n.id === pipe.endpoints[0])
    const endNode = nodes.find((n) => n.id === pipe.endpoints[1])
    if (startNode && endNode) {
      return new THREE.Vector3(
        (startNode.position.x + endNode.position.x) / 2,
        (startNode.position.y + endNode.position.y) / 2,
        (startNode.position.z + endNode.position.z) / 2
      )
    }
    return new THREE.Vector3(pipe.position.x, pipe.position.y, pipe.position.z)
  }, [selectedPipeId, pipes, nodes])

  if (!showCrossSection || !crossSectionData || !position) {
    return null
  }

  return (
    <group ref={groupRef} position={position}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.5, 0.08, 16, 64]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.5} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.04, 16, 64]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.25} />
      </mesh>
      <mesh>
        <ringGeometry args={[0, 1.2, 32]} />
        <meshBasicMaterial color="#00e5ff" transparent opacity={0.05} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

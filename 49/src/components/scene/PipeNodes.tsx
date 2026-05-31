import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { PipeNode } from '../../../shared/types'

const NODE_SCALE: Record<string, number> = {
  pump: 0.4,
  valve: 0.3,
  meter: 0.35,
  junction: 0.25,
}

const NODE_COLORS: Record<string, string> = {
  pump: '#ff6b6b',
  valve: '#4ecdc4',
  meter: '#ffe66d',
  junction: '#00e5ff',
}

type NodeType = 'junction' | 'meter' | 'valve' | 'pump'

interface NodeGroupProps {
  nodes: PipeNode[]
  type: NodeType
  disableGlow: boolean
}

function NodeGroup({ nodes, type, disableGlow }: NodeGroupProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(NODE_COLORS[type] || '#00e5ff'), [type])

  const positions = useMemo(() => {
    return nodes.map((n) => new THREE.Vector3(n.position.x, n.position.y, n.position.z))
  }, [nodes])

  useFrame((_, delta) => {
    if (!meshRef.current) return
    const mat = meshRef.current.material as THREE.MeshStandardMaterial
    const targetIntensity = hoveredId ? 1.0 : 0.4
    if (!disableGlow) {
      mat.emissiveIntensity = THREE.MathUtils.lerp(mat.emissiveIntensity, targetIntensity, delta * 5)
    } else {
      mat.emissiveIntensity = 0.1
    }
  })

  const geometry = useMemo(() => new THREE.SphereGeometry(1, 16, 16), [])
  const material = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.85,
      roughness: 0.2,
      metalness: 0.8,
    })
  }, [color])

  useMemo(() => {
    if (!meshRef.current) return
    const scale = NODE_SCALE[type] ?? 0.3
    positions.forEach((pos, i) => {
      dummy.position.copy(pos)
      dummy.scale.setScalar(scale)
      dummy.updateMatrix()
      meshRef.current!.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [positions, type, dummy])

  const handlePointerMove = (e: any) => {
    e.stopPropagation()
    const instanceId = e.instanceId
    if (instanceId !== undefined && nodes[instanceId]) {
      setHoveredId(nodes[instanceId].id)
      document.body.style.cursor = 'pointer'
    }
  }

  const handlePointerOut = () => {
    setHoveredId(null)
    document.body.style.cursor = 'auto'
  }

  const hoveredNode = useMemo(() => {
    return nodes.find((n) => n.id === hoveredId)
  }, [nodes, hoveredId])

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, nodes.length]}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
        castShadow={type === 'pump'}
      />
      {hoveredNode && (
        <Html distanceFactor={15} position={[hoveredNode.position.x, hoveredNode.position.y + 1.2, hoveredNode.position.z]} center>
          <div style={{
            background: 'rgba(10,22,40,0.9)',
            border: `1px solid ${NODE_COLORS[type]}`,
            borderRadius: 4,
            padding: '4px 8px',
            color: NODE_COLORS[type],
            fontSize: 12,
            whiteSpace: 'nowrap',
            fontFamily: 'monospace',
            pointerEvents: 'none',
          }}>
            {hoveredNode.name}
          </div>
        </Html>
      )}
    </group>
  )
}

export default function PipeNodes() {
  const nodes = usePipelineStore((s) => s.nodes)
  const disableNodeGlow = usePipelineStore((s) => s.disableNodeGlow)

  const groupedNodes = useMemo(() => {
    const groups: Record<NodeType, PipeNode[]> = {
      junction: [],
      meter: [],
      valve: [],
      pump: [],
    }
    for (const node of nodes) {
      const type = node.type as NodeType
      if (groups[type]) groups[type].push(node)
    }
    return groups
  }, [nodes])

  return (
    <group>
      {(Object.keys(groupedNodes) as NodeType[]).map((type) => (
        groupedNodes[type].length > 0 && (
          <NodeGroup key={type} nodes={groupedNodes[type]} type={type} disableGlow={disableNodeGlow} />
        )
      ))}
    </group>
  )
}

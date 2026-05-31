import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { AlarmRecord } from '../../../shared/types'
import { usePipelineStore } from '@/store/usePipelineStore'

const LEVEL_SCALE: Record<string, number> = {
  info: 0.5,
  warning: 0.8,
  critical: 1.2,
}

interface AlarmRingProps {
  position: [number, number, number]
  level: AlarmRecord['level']
}

function AlarmRing({ position, level }: AlarmRingProps) {
  const ringRef = useRef<THREE.Mesh>(null)
  const scale = LEVEL_SCALE[level] ?? 0.5

  useFrame((state) => {
    if (!ringRef.current) return
    const t = state.clock.elapsedTime
    const pulse = 1 + 0.3 * Math.sin(t * 4)
    ringRef.current.scale.set(scale * pulse, scale * pulse, scale * pulse)
    ringRef.current.rotation.z = t * 0.5
    const mat = ringRef.current.material as THREE.MeshBasicMaterial
    mat.opacity = 0.5 + 0.3 * Math.sin(t * 3)
  })

  return (
    <group position={position}>
      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1.0, 32]} />
        <meshBasicMaterial
          color="#ff3d00"
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  )
}

export default function AlarmMarker() {
  const alarms = usePipelineStore((s) => s.alarms)
  const pipes = usePipelineStore((s) => s.pipes)

  const pipeMap = new Map(pipes.map((p) => [p.id, p]))

  const alarmPositions = alarms
    .filter((a) => !a.acknowledged)
    .map((alarm) => {
      const pipe = pipeMap.get(alarm.pipeId)
      if (!pipe) return null
      return {
        id: alarm.id,
        level: alarm.level,
        position: [pipe.position.x, pipe.position.y + 1.5, pipe.position.z] as [number, number, number],
      }
    })
    .filter(Boolean) as { id: string; level: AlarmRecord['level']; position: [number, number, number] }[]

  return (
    <group>
      {alarmPositions.map((a) => (
        <AlarmRing key={a.id} position={a.position} level={a.level} />
      ))}
    </group>
  )
}

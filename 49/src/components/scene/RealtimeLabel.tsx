import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'

const STATUS_TEXT_COLOR: Record<string, string> = {
  normal: '#4caf50',
  warning: '#ffc107',
  alarm: '#f44336',
}

const VISIBILITY_DISTANCE = 50

interface PipeLabelProps {
  pipeId: string
  position: [number, number, number]
  pressure: number
  flow: number
  status: string
}

function PipeLabel({ pipeId, position, pressure, flow, status }: PipeLabelProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { camera } = useThree()

  useFrame(() => {
    if (!groupRef.current) return
    const dist = camera.position.distanceTo(groupRef.current.position)
    groupRef.current.visible = dist < VISIBILITY_DISTANCE
  })

  const textColor = STATUS_TEXT_COLOR[status] ?? STATUS_TEXT_COLOR.normal

  return (
    <group ref={groupRef} position={position}>
      <Html distanceFactor={20} center transform sprite>
        <div style={{
          background: 'rgba(10,22,40,0.85)',
          border: `1px solid ${textColor}`,
          borderRadius: 3,
          padding: '2px 6px',
          color: textColor,
          fontSize: 10,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
          lineHeight: 1.4,
        }}>
          P: {pressure.toFixed(1)}MPa F: {flow.toFixed(0)}m³/h
        </div>
      </Html>
    </group>
  )
}

export default function RealtimeLabel() {
  const pipes = usePipelineStore((s) => s.pipes)
  const realtimeData = usePipelineStore((s) => s.realtimeData)

  return (
    <group>
      {pipes.map((pipe) => {
        const rt = realtimeData.get(pipe.id)
        if (!rt) return null
        return (
          <PipeLabel
            key={pipe.id}
            pipeId={pipe.id}
            position={[pipe.position.x, pipe.position.y + 2, pipe.position.z]}
            pressure={rt.pressure}
            flow={rt.flow}
            status={rt.status}
          />
        )
      })}
    </group>
  )
}

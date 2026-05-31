import { useRef, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { PipeSegment, RealtimeData } from '../../../shared/types'

const STATUS_TEXT_COLOR: Record<string, string> = {
  normal: '#4caf50',
  warning: '#ffc107',
  alarm: '#f44336',
}

const STATUS_PRIORITY: Record<string, number> = {
  alarm: 0,
  warning: 1,
  normal: 2,
}

const MAX_LABELS = 15
const VISIBILITY_DISTANCE = 40

interface VisibleLabel {
  pipe: PipeSegment
  rt: RealtimeData
  position: [number, number, number]
  distance: number
}

export default function PipeLabels() {
  const pipes = usePipelineStore((s) => s.pipes)
  const realtimeData = usePipelineStore((s) => s.realtimeData)
  const disableLabels = usePipelineStore((s) => s.disableLabels)
  const { camera } = useThree()

  const [visibleLabels, setVisibleLabels] = useState<VisibleLabel[]>([])
  const lastUpdateRef = useRef(0)

  const labelData = useMemo(() => {
    return pipes.map((pipe) => ({
      pipe,
      position: [pipe.position.x, pipe.position.y + 2, pipe.position.z] as [number, number, number],
      vec: new THREE.Vector3(pipe.position.x, pipe.position.y + 2, pipe.position.z),
    }))
  }, [pipes])

  useFrame(() => {
    const now = performance.now()
    if (now - lastUpdateRef.current < 200) return
    lastUpdateRef.current = now

    const labels: VisibleLabel[] = []
    for (const { pipe, vec, position } of labelData) {
      const rt = realtimeData.get(pipe.id)
      if (!rt) continue
      const distance = camera.position.distanceTo(vec)
      if (distance < VISIBILITY_DISTANCE) {
        labels.push({ pipe, rt, position, distance })
      }
    }

    labels.sort((a, b) => {
      const prioA = STATUS_PRIORITY[a.rt.status] ?? 2
      const prioB = STATUS_PRIORITY[b.rt.status] ?? 2
      if (prioA !== prioB) return prioA - prioB
      return a.distance - b.distance
    })

    const sliced = labels.slice(0, MAX_LABELS)
    setVisibleLabels((prev) => {
      if (prev.length !== sliced.length) return sliced
      for (let i = 0; i < prev.length; i++) {
        if (prev[i].pipe.id !== sliced[i].pipe.id) return sliced
      }
      return prev
    })
  })

  if (disableLabels) return null

  return (
    <group>
      {visibleLabels.map(({ pipe, rt, position }) => {
        const textColor = STATUS_TEXT_COLOR[rt.status] ?? STATUS_TEXT_COLOR.normal
        return (
          <group key={pipe.id} position={position}>
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
                animation: 'fadeIn 0.3s ease-out',
              }}>
                P: {rt.pressure.toFixed(1)}MPa F: {rt.flow.toFixed(0)}m³/h
              </div>
            </Html>
          </group>
        )
      })}
      <Html style={{ display: 'none' }}>
        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: scale(0.9); }
            to { opacity: 1; transform: scale(1); }
          }
        `}</style>
      </Html>
    </group>
  )
}

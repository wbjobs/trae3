import { useMemo, useRef, useEffect, useState } from 'react'
import { Html, Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'

export default function PlannedPathOverlay() {
  const plannedPath = usePipelineStore((s) => s.plannedPath)
  const showPathPlanning = usePipelineStore((s) => s.showPathPlanning)
  const [progress, setProgress] = useState(0)
  const lineRef = useRef<any>(null)

  const points = useMemo(() => {
    if (!plannedPath) return []
    return plannedPath.waypoints.map((wp) => new THREE.Vector3(
      wp.position.x,
      wp.position.y + 0.5,
      wp.position.z
    ))
  }, [plannedPath])

  const lineGeometry = useMemo(() => {
    if (points.length < 2) return null
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    return geometry
  }, [points])

  useFrame((_, delta) => {
    setProgress((p) => (p + delta * 0.5) % 1)
    if (lineRef.current) {
      const materials = Array.isArray(lineRef.current.material) 
        ? lineRef.current.material 
        : [lineRef.current.material]
      for (const mat of materials) {
        if (mat instanceof THREE.LineDashedMaterial) {
          mat.dashSize = 0.8
          mat.gapSize = 0.4
        }
      }
    }
  })

  if (!showPathPlanning || !plannedPath || points.length < 2) {
    return null
  }

  return (
    <group>
      {lineGeometry && (
        <Line
          ref={lineRef}
          points={points}
          color="#00e5ff"
          lineWidth={2}
          dashed
          dashSize={0.8}
          gapSize={0.4}
          transparent
          opacity={0.8}
        />
      )}

      {points.map((point, i) => {
        const isLast = i === points.length - 1
        const isFirst = i === 0
        const nextPoint = points[i + 1]

        const direction = nextPoint
          ? new THREE.Vector3().subVectors(nextPoint, point).normalize()
          : null

        return (
          <group key={i} position={point.toArray() as [number, number, number]}>
            <mesh>
              <cylinderGeometry args={[0.3, 0.3, 0.1, 16]} />
              <meshBasicMaterial color="#00e5ff" transparent opacity={0.3} />
            </mesh>
            <mesh position={[0, 0.15, 0]}>
              <cylinderGeometry args={[0.15, 0.15, 0.2, 16]} />
              <meshBasicMaterial color="#00e5ff" />
            </mesh>

            {direction && (
              <group position={direction.clone().multiplyScalar(0.6).toArray() as [number, number, number]}>
                <mesh rotation={[0, Math.atan2(direction.x, direction.z), 0]}>
                  <coneGeometry args={[0.15, 0.3, 8]} />
                  <meshBasicMaterial color="#00e5ff" transparent opacity={0.6} />
                </mesh>
              </group>
            )}

            <Html
              position={[0, 0.6, 0]}
              center
              style={{ pointerEvents: 'none' }}
            >
              <div
                className={`w-6 h-6 flex items-center justify-center rounded-full text-[10px] font-bold ${
                  isFirst ? 'bg-pipeline-ok text-white' : isLast ? 'bg-pipeline-warn text-white' : 'bg-pipeline-cyan text-[#0a1628]'
                }`}
              >
                {i + 1}
              </div>
            </Html>
          </group>
        )
      })}

      {progress > 0 && (
        <group>
          {points.map((point, i) => {
            if (i === points.length - 1) return null
            const nextPoint = points[i + 1]
            const segmentProgress = Math.min(1, Math.max(0, progress * (points.length - 1) - i))
            if (segmentProgress < 0 || segmentProgress > 1) return null

            const currentPos = new THREE.Vector3().lerpVectors(point, nextPoint, segmentProgress)

            return (
              <mesh
                key={`progress-${i}`}
                position={currentPos.toArray() as [number, number, number]}
              >
                <sphereGeometry args={[0.2, 16, 16]} />
                <meshBasicMaterial color="#00e5ff" transparent opacity={0.9} />
              </mesh>
            )
          })}
        </group>
      )}
    </group>
  )
}

import { useMemo, useRef, useState } from 'react'
import { Line } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'

export default function PlannedPathVisualization() {
  const plannedPath = usePipelineStore((s) => s.plannedPath)
  const showPathPlanning = usePipelineStore((s) => s.showPathPlanning)
  const [progress, setProgress] = useState(0)
  const groupRef = useRef<THREE.Group>(null)

  const points = useMemo(() => {
    if (!plannedPath || plannedPath.waypoints.length < 2) return []
    return plannedPath.waypoints.map(
      (wp) => new THREE.Vector3(wp.position.x, wp.position.y + 0.5, wp.position.z)
    )
  }, [plannedPath])

  const curvePoints = useMemo(() => {
    if (points.length < 2) return []
    const curve = new THREE.CatmullRomCurve3(points)
    return curve.getPoints(points.length * 10)
  }, [points])

  const curve = useMemo(() => {
    if (points.length < 2) return null
    return new THREE.CatmullRomCurve3(points)
  }, [points])

  useFrame((_, delta) => {
    setProgress((p) => (p + delta * 0.3) % 1)
    if (curve && groupRef.current) {
      const point = curve.getPoint(progress)
      groupRef.current.position.copy(point)
    }
  })

  if (!showPathPlanning || !plannedPath || points.length < 2) {
    return null
  }

  return (
    <group>
      {curvePoints.length > 1 && (
        <Line
          points={curvePoints}
          color="#00e5ff"
          lineWidth={2}
          dashed
          dashSize={0.8}
          gapSize={0.4}
          transparent
          opacity={0.7}
        />
      )}

      {points.map((point, i) => (
        <group key={i} position={point.toArray() as [number, number, number]}>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <octahedronGeometry args={[0.25, 0]} />
            <meshBasicMaterial color={i === 0 ? '#4caf50' : i === points.length - 1 ? '#ff9800' : '#00e5ff'} />
          </mesh>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <octahedronGeometry args={[0.35, 0]} />
            <meshBasicMaterial
              color={i === 0 ? '#4caf50' : i === points.length - 1 ? '#ff9800' : '#00e5ff'}
              transparent
              opacity={0.2}
            />
          </mesh>
        </group>
      ))}

      <group ref={groupRef}>
        <mesh>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshBasicMaterial color="#00e5ff" transparent opacity={0.9} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.3, 16, 16]} />
          <meshBasicMaterial color="#00e5ff" transparent opacity={0.15} />
        </mesh>
      </group>
    </group>
  )
}

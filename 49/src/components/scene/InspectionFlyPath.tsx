import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { InspectionPath, InspectionWaypoint } from '../../../shared/types'

interface WaypointMarkerProps {
  position: [number, number, number]
  index: number
}

function WaypointMarker({ position, index }: WaypointMarkerProps) {
  return (
    <group position={position}>
      <mesh>
        <octahedronGeometry args={[0.2, 0]} />
        <meshStandardMaterial
          color="#00e5ff"
          emissive="#00e5ff"
          emissiveIntensity={0.6}
          transparent
          opacity={0.8}
        />
      </mesh>
    </group>
  )
}

interface FlySphereProps {
  waypoints: InspectionWaypoint[]
}

function FlySphere({ waypoints }: FlySphereProps) {
  const sphereRef = useRef<THREE.Mesh>(null)
  const progress = useRef(0)

  const positions = useMemo(
    () => waypoints.map((w) => new THREE.Vector3(w.position.x, w.position.y, w.position.z)),
    [waypoints]
  )

  const curve = useMemo(() => {
    if (positions.length < 2) return null
    return new THREE.CatmullRomCurve3(positions, false, 'catmullrom', 0.5)
  }, [positions])

  useFrame((_, delta) => {
    if (!sphereRef.current || !curve) return
    progress.current += delta * 0.1
    if (progress.current > 1) progress.current = 0
    const point = curve.getPoint(progress.current)
    sphereRef.current.position.copy(point)
  })

  if (!curve) return null

  return (
    <mesh ref={sphereRef}>
      <sphereGeometry args={[0.25, 16, 16]} />
      <meshStandardMaterial
        color="#00e5ff"
        emissive="#00e5ff"
        emissiveIntensity={1.0}
        transparent
        opacity={0.9}
      />
    </mesh>
  )
}

interface PathLineProps {
  waypoints: InspectionWaypoint[]
}

function PathLine({ waypoints }: PathLineProps) {
  const linePoints = useMemo(() => {
    const points = waypoints.map(
      (w) => new THREE.Vector3(w.position.x, w.position.y, w.position.z)
    )
    if (points.length < 2) return []
    const curve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.5)
    return curve.getPoints(waypoints.length * 20)
  }, [waypoints])

  if (linePoints.length < 2) return null

  return (
    <Line
      points={linePoints}
      color="#00e5ff"
      lineWidth={1.5}
      dashed
      dashSize={0.5}
      gapSize={0.3}
      transparent
      opacity={0.6}
    />
  )
}

interface InspectionPathViewProps {
  path: InspectionPath
}

function InspectionPathView({ path }: InspectionPathViewProps) {
  const waypoints = path.waypoints

  return (
    <group>
      <PathLine waypoints={waypoints} />
      <FlySphere waypoints={waypoints} />
      {waypoints.map((wp, i) => (
        <WaypointMarker
          key={wp.id}
          position={[wp.position.x, wp.position.y, wp.position.z]}
          index={i}
        />
      ))}
    </group>
  )
}

export default function InspectionFlyPath() {
  const inspectionPaths = usePipelineStore((s) => s.inspectionPaths)

  return (
    <group>
      {inspectionPaths.map((path) => (
        <InspectionPathView key={path.id} path={path} />
      ))}
    </group>
  )
}

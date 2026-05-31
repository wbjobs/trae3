import { useMemo, useRef, useEffect } from 'react'
import * as THREE from 'three'
import { useDeviceStore } from '@/stores/deviceStore'

const floorHeights = {
  '-1': { y: 0, label: 'B1' },
  '1': { y: 4, label: '1F' },
  '2': { y: 8, label: '2F' },
}

const PIPE_CONFIGS = {
  hvac: { radius: 0.35, color: '#ef4444', segments: 6 },
  plumbing: { radius: 0.2, color: '#3b82f6', segments: 5 },
  electrical: { radius: 0.15, color: '#eab308', segments: 4 },
  fire: { radius: 0.25, color: '#f97316', segments: 5 },
  riser: { radius: 0.5, color: '#64748b', segments: 8 },
} as const

function createPipePath(points: THREE.Vector3[]): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3(points, false, 'centripetal', 0.2)
}

function InstancedPipes({
  paths,
  type,
  qualityLevel,
  visible,
}: {
  paths: THREE.CatmullRomCurve3[]
  type: keyof typeof PIPE_CONFIGS
  qualityLevel: number
  visible: boolean
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const config = PIPE_CONFIGS[type]
  const tubeSegments = qualityLevel > 1 ? 24 : 12

  const { geometry, material } = useMemo(() => {
    const tempPath = createPipePath([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0),
    ])
    const geo = new THREE.TubeGeometry(tempPath, tubeSegments, config.radius, config.segments, false)
    const mat = new THREE.MeshStandardMaterial({
      color: config.color,
      metalness: 0.4,
      roughness: 0.6,
    })
    return { geometry: geo, material: mat }
  }, [config, tubeSegments])

  const matrices = useMemo(() => {
    return paths.map(() => new THREE.Matrix4())
  }, [paths.length])

  useEffect(() => {
    if (!meshRef.current) return

    paths.forEach((path, i) => {
      const dummy = new THREE.Object3D()
      const points = path.getPoints(50)
      for (let j = 0; j < points.length - 1; j++) {
        const start = points[j]
        const end = points[j + 1]
        const direction = new THREE.Vector3().subVectors(end, start)
        const length = direction.length()
        const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)

        dummy.position.copy(center)
        dummy.lookAt(end)
        dummy.scale.set(length, 1, 1)
        dummy.updateMatrix()

        meshRef.current!.setMatrixAt(i * (points.length - 1) + j, dummy.matrix)
      }
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [paths])

  if (!visible || paths.length === 0) return null

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, paths.length * 50]}
      frustumCulled={false}
    />
  )
}

function FloorSlab({ y, visible }: { y: number; visible: boolean }) {
  const geometry = useMemo(() => new THREE.PlaneGeometry(50, 50), [])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: '#0f172a',
        transparent: true,
        opacity: 0.25,
        metalness: 0.2,
        roughness: 0.8,
      }),
    []
  )

  if (!visible) return null
  return (
    <mesh position={[0, y - 0.15, 0]} rotation={[-Math.PI / 2, 0, 0]} geometry={geometry} material={material} />
  )
}

function PipelineModel({ qualityLevel }: { qualityLevel: number }) {
  const layers = useDeviceStore((s) => s.layers)
  const currentFloor = useDeviceStore((s) => s.currentFloor)

  const hvacPaths = useMemo(
    () => [
      createPipePath([
        new THREE.Vector3(-20, 1, -15),
        new THREE.Vector3(-10, 1, -15),
        new THREE.Vector3(-10, 1, 15),
        new THREE.Vector3(15, 1, 15),
      ]),
      createPipePath([
        new THREE.Vector3(-20, 1, 0),
        new THREE.Vector3(10, 1, 0),
        new THREE.Vector3(10, 1, -10),
      ]),
      createPipePath([
        new THREE.Vector3(-20, 5, -15),
        new THREE.Vector3(-5, 5, -15),
        new THREE.Vector3(-5, 5, 10),
        new THREE.Vector3(15, 5, 10),
      ]),
      createPipePath([
        new THREE.Vector3(-20, 9, -15),
        new THREE.Vector3(0, 9, -15),
        new THREE.Vector3(0, 9, 10),
        new THREE.Vector3(15, 9, 10),
      ]),
    ],
    []
  )

  const plumbingPaths = useMemo(
    () => [
      createPipePath([
        new THREE.Vector3(20, 1.5, -15),
        new THREE.Vector3(20, 1.5, 10),
        new THREE.Vector3(0, 1.5, 10),
      ]),
      createPipePath([
        new THREE.Vector3(20, 5.5, -15),
        new THREE.Vector3(20, 5.5, 10),
        new THREE.Vector3(-5, 5.5, 10),
      ]),
      createPipePath([
        new THREE.Vector3(20, 9.5, -15),
        new THREE.Vector3(20, 9.5, 10),
      ]),
    ],
    []
  )

  const electricalPaths = useMemo(
    () => [
      createPipePath([
        new THREE.Vector3(-15, 2.5, -18),
        new THREE.Vector3(10, 2.5, -18),
        new THREE.Vector3(10, 2.5, 12),
      ]),
      createPipePath([
        new THREE.Vector3(-15, 6.5, -18),
        new THREE.Vector3(10, 6.5, -18),
        new THREE.Vector3(10, 6.5, 12),
      ]),
      createPipePath([
        new THREE.Vector3(-15, 10.5, -18),
        new THREE.Vector3(10, 10.5, -18),
        new THREE.Vector3(10, 10.5, 12),
      ]),
    ],
    []
  )

  const firePaths = useMemo(
    () => [
      createPipePath([
        new THREE.Vector3(-22, 3, -12),
        new THREE.Vector3(-22, 3, 12),
        new THREE.Vector3(18, 3, 12),
      ]),
      createPipePath([
        new THREE.Vector3(-22, 7, -12),
        new THREE.Vector3(-22, 7, 12),
        new THREE.Vector3(18, 7, 12),
      ]),
      createPipePath([
        new THREE.Vector3(-22, 11, -12),
        new THREE.Vector3(-22, 11, 12),
        new THREE.Vector3(18, 11, 12),
      ]),
    ],
    []
  )

  const riserPaths = useMemo(
    () => [
      createPipePath([
        new THREE.Vector3(-18, 1, -5),
        new THREE.Vector3(-18, 11, -5),
      ]),
      createPipePath([
        new THREE.Vector3(18, 1, -5),
        new THREE.Vector3(18, 11, -5),
      ]),
    ],
    []
  )

  const showFloor = (floor: number) => {
    if (currentFloor === -1) return true
    return currentFloor === floor
  }

  return (
    <group>
      <InstancedPipes paths={hvacPaths} type="hvac" qualityLevel={qualityLevel} visible={layers.hvac} />
      <InstancedPipes paths={plumbingPaths} type="plumbing" qualityLevel={qualityLevel} visible={layers.plumbing} />
      <InstancedPipes paths={electricalPaths} type="electrical" qualityLevel={qualityLevel} visible={layers.electrical} />
      <InstancedPipes paths={firePaths} type="fire" qualityLevel={qualityLevel} visible={layers.fire} />
      <InstancedPipes paths={riserPaths} type="riser" qualityLevel={qualityLevel} visible={true} />

      {Object.entries(floorHeights).map(([floor, config]) => (
        <FloorSlab key={`floor-${floor}`} y={config.y} visible={showFloor(Number(floor))} />
      ))}
    </group>
  )
}

export default PipelineModel

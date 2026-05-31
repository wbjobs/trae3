import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { PipeSegment, PipeNode } from '../../../shared/types'

const STATUS_COLORS: Record<string, string> = {
  normal: '#00e5ff',
  warning: '#ffa726',
  alarm: '#ff3d00',
}

const HOVER_EMISSIVE: Record<string, string> = {
  normal: '#005566',
  warning: '#664400',
  alarm: '#660000',
}

function getDiameterGroup(diameter: number): 'small' | 'medium' | 'large' {
  if (diameter < 200) return 'small'
  if (diameter < 400) return 'medium'
  return 'large'
}

interface PipeLODProps {
  pipe: PipeSegment
  startNode: PipeNode | undefined
  endNode: PipeNode | undefined
  isSelected: boolean
  onSelect: (id: string) => void
  disableHighDetail: boolean
  geometryCache: Map<string, THREE.BufferGeometry>
}

function PipeLOD({ pipe, startNode, endNode, isSelected, onSelect, disableHighDetail, geometryCache }: PipeLODProps) {
  const groupRef = useRef<THREE.Group>(null)
  const lodRef = useRef<THREE.LOD | null>(null)
  const [hovered, setHovered] = useState(false)

  const { start, end, radius, color, emissiveColor } = useMemo(() => {
    const startVec = startNode
      ? new THREE.Vector3(startNode.position.x, startNode.position.y, startNode.position.z)
      : new THREE.Vector3(pipe.position.x, pipe.position.y, pipe.position.z)
    const endVec = endNode
      ? new THREE.Vector3(endNode.position.x, endNode.position.y, endNode.position.z)
      : new THREE.Vector3(pipe.position.x + 5, pipe.position.y, pipe.position.z + 5)
    const rad = Math.max(pipe.diameter / 500, 0.05)
    const baseColor = STATUS_COLORS[pipe.status] || STATUS_COLORS.normal
    const emissive = HOVER_EMISSIVE[pipe.status] || HOVER_EMISSIVE.normal
    return { start: startVec, end: endVec, radius: rad, color: baseColor, emissiveColor: emissive }
  }, [pipe, startNode, endNode])

  const { position, quaternion, height } = useMemo(() => {
    const center = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
    const direction = new THREE.Vector3().subVectors(end, start).normalize()
    const up = new THREE.Vector3(0, 1, 0)
    const quat = new THREE.Quaternion().setFromUnitVectors(up, direction)
    const len = start.distanceTo(end)
    return { position: center, quaternion: quat, height: len }
  }, [start, end])

  const geometries = useMemo(() => {
    const diamGroup = getDiameterGroup(pipe.diameter)
    const cacheKey0 = `tube_${diamGroup}_${radius}_${height.toFixed(2)}`
    const cacheKey1 = `cyl8_${diamGroup}_${radius}_${height.toFixed(2)}`
    const cacheKey2 = `cyl4_${diamGroup}_${radius}_${height.toFixed(2)}`

    let geo0 = geometryCache.get(cacheKey0)
    let geo1 = geometryCache.get(cacheKey1)
    let geo2 = geometryCache.get(cacheKey2)

    if (!geo0) {
      const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5)
      mid.add(new THREE.Vector3((start.z - end.z) * 0.05, Math.abs(start.y - end.y) * 0.1 + 0.5, (end.x - start.x) * 0.05))
      const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
      geo0 = new THREE.TubeGeometry(curve, 20, radius, 12, false)
      geometryCache.set(cacheKey0, geo0)
    }
    if (!geo1) {
      geo1 = new THREE.CylinderGeometry(radius, radius, height, 8)
      geometryCache.set(cacheKey1, geo1)
    }
    if (!geo2) {
      geo2 = new THREE.CylinderGeometry(radius, radius, height, 4)
      geometryCache.set(cacheKey2, geo2)
    }
    return { geo0, geo1, geo2 }
  }, [pipe.diameter, radius, height, start, end, geometryCache])

  useEffect(() => {
    if (!groupRef.current) return
    if (lodRef.current) {
      groupRef.current.remove(lodRef.current)
    }
    const lod = new THREE.LOD()
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 })
    
    if (!disableHighDetail) {
      const mesh0 = new THREE.Mesh(geometries.geo0, mat.clone())
      lod.addLevel(mesh0, 0)
    }
    const mesh1 = new THREE.Mesh(geometries.geo1, mat.clone())
    lod.addLevel(mesh1, 20)
    const mesh2 = new THREE.Mesh(geometries.geo2, mat.clone())
    lod.addLevel(mesh2, 50)
    
    groupRef.current.add(lod)
    lodRef.current = lod
    
    return () => {
      mat.dispose()
    }
  }, [geometries, color, disableHighDetail])

  useFrame(({ camera }) => {
    if (!lodRef.current || !groupRef.current) return
    lodRef.current.update(camera)
    groupRef.current.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mat = obj.material as THREE.MeshStandardMaterial
        const targetEmissive = hovered || isSelected ? emissiveColor : '#000000'
        mat.emissive.lerp(new THREE.Color(targetEmissive), 0.15)
      }
    })
  })

  return (
    <group 
      ref={groupRef} 
      position={position} 
      quaternion={quaternion}
      onClick={(e) => { e.stopPropagation(); onSelect(pipe.id) }}
      onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto' }}
    />
  )
}

export default function PipeNetwork() {
  const pipes = usePipelineStore((s) => s.pipes)
  const nodes = usePipelineStore((s) => s.nodes)
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const selectPipe = usePipelineStore((s) => s.selectPipe)
  const disableHighDetailLOD = usePipelineStore((s) => s.disableHighDetailLOD)
  const { camera } = useThree()

  const frustumRef = useRef(new THREE.Frustum())
  const matrixRef = useRef(new THREE.Matrix4())
  const visiblePipesRef = useRef<Set<string>>(new Set())

  const nodeMap = useMemo(() => {
    const map = new Map<string, PipeNode>()
    for (const n of nodes) map.set(n.id, n)
    return map
  }, [nodes])

  const geometryCache = useMemo(() => new Map<string, THREE.BufferGeometry>(), [])

  const pipeGroups = useMemo(() => {
    const groups: Record<'small' | 'medium' | 'large', PipeSegment[]> = { small: [], medium: [], large: [] }
    for (const pipe of pipes) groups[getDiameterGroup(pipe.diameter)].push(pipe)
    return groups
  }, [pipes])

  useFrame(() => {
    matrixRef.current.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustumRef.current.setFromProjectionMatrix(matrixRef.current)
    visiblePipesRef.current.clear()
    for (const pipe of pipes) {
      const startNode = nodeMap.get(pipe.endpoints[0])
      const endNode = nodeMap.get(pipe.endpoints[1])
      const center = startNode && endNode
        ? new THREE.Vector3(
            (startNode.position.x + endNode.position.x) / 2,
            (startNode.position.y + endNode.position.y) / 2,
            (startNode.position.z + endNode.position.z) / 2
          )
        : new THREE.Vector3(pipe.position.x, pipe.position.y, pipe.position.z)
      const radius = Math.max(pipe.diameter / 500, 0.05) * 2
      const sphere = new THREE.Sphere(center, radius + pipe.length / 2)
      if (frustumRef.current.intersectsSphere(sphere)) visiblePipesRef.current.add(pipe.id)
    }
  })

  const allPipes = useMemo(() => [...pipeGroups.large, ...pipeGroups.medium, ...pipeGroups.small], [pipeGroups])

  return (
    <group>
      {allPipes.map((pipe) => {
        const isVisible = visiblePipesRef.current.has(pipe.id) || visiblePipesRef.current.size === 0
        if (!isVisible) return null
        return (
          <PipeLOD
            key={pipe.id}
            pipe={pipe}
            startNode={nodeMap.get(pipe.endpoints[0])}
            endNode={nodeMap.get(pipe.endpoints[1])}
            isSelected={selectedPipeId === pipe.id}
            onSelect={selectPipe}
            disableHighDetail={disableHighDetailLOD}
            geometryCache={geometryCache}
          />
        )
      })}
    </group>
  )
}

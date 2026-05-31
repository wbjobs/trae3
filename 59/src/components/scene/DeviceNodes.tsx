import { useState, useRef, memo, useMemo, useCallback } from 'react'
import * as THREE from 'three'
import type { ThreeEvent } from '@react-three/fiber'
import { Html, useCursor } from '@react-three/drei'
import { useDeviceStore } from '@/stores/deviceStore'
import type { Device } from '../../../shared/types'

const STATUS_COLORS = {
  online: '#00E676',
  alarm: '#FF1744',
  offline: '#64748b',
} as const

const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>()

function getSphereGeometry(segments: number): THREE.BufferGeometry {
  const key = `sphere-${segments}`
  if (GEOMETRY_CACHE.has(key)) return GEOMETRY_CACHE.get(key)!
  const geo = new THREE.SphereGeometry(0.35, segments, segments)
  GEOMETRY_CACHE.set(key, geo)
  return geo
}

function getRingGeometry(segments: number): THREE.BufferGeometry {
  const key = `ring-${segments}`
  if (GEOMETRY_CACHE.has(key)) return GEOMETRY_CACHE.get(key)!
  const geo = new THREE.RingGeometry(0.5, 0.6, segments)
  GEOMETRY_CACHE.set(key, geo)
  return geo
}

interface DeviceMarkerProps {
  device: Device
  onSelect: (device: Device) => void
  qualityLevel: number
}

const DeviceMarker = memo(function DeviceMarker({
  device,
  onSelect,
  qualityLevel,
}: DeviceMarkerProps) {
  const [hovered, setHovered] = useState(false)
  const meshRef = useRef<THREE.Mesh>(null)

  useCursor(hovered)

  const sphereSegments = useMemo(() => (qualityLevel > 1 ? 16 : 8), [qualityLevel])
  const ringSegments = useMemo(() => (qualityLevel > 1 ? 32 : 16), [qualityLevel])

  const color = STATUS_COLORS[device.status]

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      onSelect(device)
    },
    [onSelect, device],
  )

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
  }, [])

  const handlePointerOut = useCallback(() => setHovered(false), [])

  const emissiveIntensity = useMemo(
    () => (device.status === 'alarm' ? 1 : hovered ? 0.6 : 0.4),
    [device.status, hovered],
  )

  const scale = hovered ? 1.5 : 1

  const geometry = useMemo(() => getSphereGeometry(sphereSegments), [sphereSegments])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        emissive: color,
        emissiveIntensity,
      }),
    [color, emissiveIntensity],
  )

  const ringGeometry = useMemo(() => getRingGeometry(ringSegments), [ringSegments])
  const ringMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#FF1744',
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      }),
    [],
  )

  const statusLabel = useMemo(() => {
    return device.status === 'online' ? '在线' : device.status === 'alarm' ? '告警' : '离线'
  }, [device.status])

  return (
    <group position={[device.position.x, device.position.y, device.position.z]}>
      <mesh
        ref={meshRef}
        scale={scale}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        geometry={geometry}
        material={material}
      />

      {device.status === 'alarm' && <mesh geometry={ringGeometry} material={ringMaterial} />}

      {hovered && (
        <Html center distanceFactor={8} zIndexRange={[100, 0]}>
          <div className="glass-panel px-3 py-2 rounded text-xs whitespace-nowrap shadow-lg">
            <div className="font-display font-semibold text-neon-cyan">{device.name}</div>
            <div className="text-slate-400 flex items-center gap-1.5 mt-0.5">
              <span className={`status-dot status-${device.status}`}></span>
              {statusLabel}
            </div>
          </div>
        </Html>
      )}
    </group>
  )
})

interface DeviceNodesProps {
  qualityLevel: number
}

function DeviceNodes({ qualityLevel }: DeviceNodesProps) {
  const devices = useDeviceStore((s) => s.devices)
  const layers = useDeviceStore((s) => s.layers)
  const currentFloor = useDeviceStore((s) => s.currentFloor)
  const setSelectedDevice = useDeviceStore((s) => s.setSelectedDevice)

  const filteredDevices = useMemo(() => {
    return devices.filter((d) => {
      if (!layers[d.type]) return false
      if (currentFloor !== -1 && d.floor !== currentFloor) return false
      return true
    })
  }, [devices, layers, currentFloor])

  return (
    <group>
      {filteredDevices.map((device) => (
        <DeviceMarker
          key={device.id}
          device={device}
          onSelect={setSelectedDevice}
          qualityLevel={qualityLevel}
        />
      ))}
    </group>
  )
}

export default memo(DeviceNodes)

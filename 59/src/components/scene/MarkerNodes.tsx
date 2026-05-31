import { useState, useMemo, useCallback, memo } from 'react'
import * as THREE from 'three'
import { ThreeEvent } from '@react-three/fiber'
import { Html, useCursor } from '@react-three/drei'
import { useDeviceStore } from '@/stores/deviceStore'
import type { MarkerPoint } from '../../../shared/types'

const MARKER_CONFIGS = {
  inspection: { color: '#00E676', icon: '📋' },
  maintenance: { color: '#FFB300', icon: '🔧' },
  danger: { color: '#FF1744', icon: '⚠️' },
  note: { color: '#64B5F6', icon: '📝' },
} as const

const GEOMETRY_CACHE = new Map<string, THREE.BufferGeometry>()

function getMarkerGeometry(): THREE.BufferGeometry {
  const key = 'marker-cone'
  if (GEOMETRY_CACHE.has(key)) return GEOMETRY_CACHE.get(key)!
  const geo = new THREE.ConeGeometry(0.25, 0.6, 8)
  GEOMETRY_CACHE.set(key, geo)
  return geo
}

function getDiscGeometry(): THREE.BufferGeometry {
  const key = 'marker-disc'
  if (GEOMETRY_CACHE.has(key)) return GEOMETRY_CACHE.get(key)!
  const geo = new THREE.CircleGeometry(0.4, 16)
  GEOMETRY_CACHE.set(key, geo)
  return geo
}

const MarkerItem = memo(function MarkerItem({
  marker,
  onSelect,
}: {
  marker: MarkerPoint
  onSelect: (marker: MarkerPoint) => void
}) {
  const [hovered, setHovered] = useState(false)
  const config = MARKER_CONFIGS[marker.type]

  useCursor(hovered)

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      onSelect(marker)
    },
    [onSelect, marker],
  )

  const handlePointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    setHovered(true)
  }, [])

  const handlePointerOut = useCallback(() => setHovered(false), [])

  const scale = hovered ? 1.3 : 1

  const coneGeometry = useMemo(() => getMarkerGeometry(), [])
  const discGeometry = useMemo(() => getDiscGeometry(), [])

  const coneMaterial = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: config.color,
        emissive: config.color,
        emissiveIntensity: hovered ? 0.8 : 0.4,
      }),
    [config.color, hovered],
  )

  const discMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: config.color,
        transparent: true,
        opacity: 0.3,
        side: THREE.DoubleSide,
      }),
    [config.color],
  )

  return (
    <group position={[marker.position.x, marker.position.y + 0.8, marker.position.z]}>
      <mesh
        scale={scale}
        onClick={handleClick}
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        geometry={coneGeometry}
        material={coneMaterial}
      />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.8, 0]}
        geometry={discGeometry}
        material={discMaterial}
      />

      {hovered && (
        <Html center distanceFactor={6} zIndexRange={[100, 0]}>
          <div className="glass-panel px-3 py-2 rounded text-xs whitespace-nowrap shadow-lg max-w-xs">
            <div className="font-display font-semibold flex items-center gap-1.5" style={{ color: config.color }}>
              <span>{config.icon}</span>
              <span>{marker.title}</span>
            </div>
            <div className="text-slate-400 mt-1 text-[10px]">{marker.description}</div>
          </div>
        </Html>
      )}
    </group>
  )
})

function MarkerNodes() {
  const markers = useDeviceStore((s) => s.markers)
  const showMarkers = useDeviceStore((s) => s.showMarkers)
  const currentFloor = useDeviceStore((s) => s.currentFloor)
  const setSelectedMarker = useDeviceStore((s) => s.setSelectedMarker)

  const filteredMarkers = useMemo(() => {
    if (!showMarkers) return []
    if (currentFloor === -1) return markers
    return markers.filter((m) => m.floor === currentFloor)
  }, [markers, showMarkers, currentFloor])

  return (
    <group>
      {filteredMarkers.map((marker) => (
        <MarkerItem key={marker.id} marker={marker} onSelect={setSelectedMarker} />
      ))}
    </group>
  )
}

export default memo(MarkerNodes)

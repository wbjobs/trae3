import { useMemo } from 'react'
import * as THREE from 'three'
import { useDeviceStore } from '@/stores/deviceStore'

export default function CutPlaneMesh() {
  const cutPlane = useDeviceStore((s) => s.cutPlane)

  const { geometry, material, position, rotation } = useMemo(() => {
    const geo = new THREE.PlaneGeometry(60, 60)
    const mat = new THREE.MeshBasicMaterial({
      color: '#00F0FF',
      transparent: true,
      opacity: 0.1,
      side: THREE.DoubleSide,
      wireframe: false,
    })

    const pos = new THREE.Vector3()
    const rot = new THREE.Euler()

    if (cutPlane.enabled) {
      switch (cutPlane.axis) {
        case 'x':
          pos.set(cutPlane.position, 6, 0)
          rot.set(0, Math.PI / 2, 0)
          break
        case 'y':
          pos.set(0, cutPlane.position, 0)
          rot.set(-Math.PI / 2, 0, 0)
          break
        case 'z':
          pos.set(0, 6, cutPlane.position)
          rot.set(0, 0, 0)
          break
      }
    }

    return { geometry: geo, material: mat, position: pos, rotation: rot }
  }, [cutPlane])

  if (!cutPlane.enabled) return null

  return (
    <group>
      <mesh position={position} rotation={rotation} geometry={geometry} material={material} />
      <mesh position={position} rotation={rotation}>
        <ringGeometry args={[0.1, 15, 4]} />
        <meshBasicMaterial color="#00F0FF" transparent opacity={0.3} side={THREE.DoubleSide} wireframe />
      </mesh>
    </group>
  )
}

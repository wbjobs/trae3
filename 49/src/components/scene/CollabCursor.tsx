import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { usePipelineStore } from '@/store/usePipelineStore'
import type { CollaborationUser } from '../../../shared/types'

interface CursorProps {
  user: CollaborationUser
}

function Cursor({ user }: CursorProps) {
  const groupRef = useRef<THREE.Group>(null)
  const targetPos = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    if (!groupRef.current || !user.cursor) return
    targetPos.current.set(user.cursor.x, user.cursor.y, user.cursor.z)
    groupRef.current.position.lerp(targetPos.current, delta * 5)
  })

  if (!user.cursor) return null

  return (
    <group ref={groupRef} position={[user.cursor.x, user.cursor.y, user.cursor.z]}>
      <mesh rotation={[Math.PI, 0, 0]} position={[0, 0.6, 0]}>
        <coneGeometry args={[0.15, 0.4, 8]} />
        <meshBasicMaterial color={user.color} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.02, 0.02, 0.6, 4]} />
        <meshBasicMaterial color={user.color} />
      </mesh>
      <Html distanceFactor={20} position={[0, 1.0, 0]} center>
        <div style={{
          background: 'rgba(10,22,40,0.85)',
          border: `1px solid ${user.color}`,
          borderRadius: 3,
          padding: '2px 6px',
          color: user.color,
          fontSize: 10,
          fontFamily: 'monospace',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        }}>
          {user.name}
        </div>
      </Html>
    </group>
  )
}

export default function CollabCursor() {
  const onlineUsers = usePipelineStore((s) => s.onlineUsers)
  const currentUser = usePipelineStore((s) => s.currentUser)

  const otherUsers = onlineUsers.filter((u) => u.id !== currentUser?.id)

  return (
    <group>
      {otherUsers.map((user) => (
        <Cursor key={user.id} user={user} />
      ))}
    </group>
  )
}

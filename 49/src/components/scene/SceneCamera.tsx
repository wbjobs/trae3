import { OrbitControls, PerspectiveCamera } from '@react-three/drei'

export default function SceneCamera() {
  return (
    <>
      <PerspectiveCamera fov={60} position={[25, 20, 25]} makeDefault />
      <OrbitControls
        target={[0, 0, 0]}
        enableDamping
        dampingFactor={0.08}
        minDistance={5}
        maxDistance={100}
        maxPolarAngle={Math.PI * 80 / 180}
        rotateSpeed={0.8}
        zoomSpeed={1.2}
      />
    </>
  )
}

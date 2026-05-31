import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, PerformanceMonitor, AdaptiveDpr } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { Suspense, useMemo, useState, useEffect, useRef } from 'react'
import * as THREE from 'three'
import PipelineModel from './PipelineModel'
import DeviceNodes from './DeviceNodes'
import MarkerNodes from './MarkerNodes'
import CutPlaneMesh from './CutPlaneMesh'
import { useDeviceStore } from '@/stores/deviceStore'

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.3} />
      <directionalLight position={[20, 25, 15]} intensity={0.7} />
      <directionalLight position={[-15, 20, -10]} intensity={0.3} />
    </>
  )
}

function OptimizedEffects() {
  return (
    <EffectComposer multisampling={0} enabled={true}>
      <Bloom
        intensity={0.25}
        luminanceThreshold={0.92}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
      <Vignette darkness={0.25} offset={0.5} />
    </EffectComposer>
  )
}

function ClippingUpdater() {
  const cutPlane = useDeviceStore((s) => s.cutPlane)
  const { gl } = useThree()

  useEffect(() => {
    if (cutPlane.enabled) {
      const plane = new THREE.Plane()
      const normal = new THREE.Vector3()
      normal[cutPlane.axis] = cutPlane.inverse ? -1 : 1
      plane.setFromNormalAndCoplanarPoint(
        normal,
        new THREE.Vector3(
          cutPlane.axis === 'x' ? cutPlane.position : 0,
          cutPlane.axis === 'y' ? cutPlane.position : 0,
          cutPlane.axis === 'z' ? cutPlane.position : 0,
        ),
      )
      gl.clippingPlanes = [plane]
      gl.localClippingEnabled = true
    } else {
      gl.clippingPlanes = []
      gl.localClippingEnabled = false
    }

    return () => {
      gl.clippingPlanes = []
      gl.localClippingEnabled = false
    }
  }, [cutPlane, gl])

  return null
}

function SceneContent({ qualityLevel }: { qualityLevel: number }) {
  const gridSize = useMemo(() => {
    return qualityLevel > 1 ? 80 : 50
  }, [qualityLevel])

  const gridSection = useMemo(() => {
    return qualityLevel > 1 ? 10 : 5
  }, [qualityLevel])

  return (
    <>
      <SceneLighting />
      <ClippingUpdater />
      <PipelineModel qualityLevel={qualityLevel} />
      <DeviceNodes qualityLevel={qualityLevel} />
      <MarkerNodes />
      <CutPlaneMesh />
      <Grid
        position={[0, -0.5, 0]}
        args={[gridSize, gridSize]}
        cellSize={1}
        cellThickness={0.3}
        cellColor="#1e3a5f"
        sectionSize={gridSection}
        sectionThickness={0.5}
        sectionColor="#0a1628"
        fadeDistance={50}
        fadeStrength={1}
        followCamera={false}
      />
      <OptimizedEffects />
    </>
  )
}

export default function PipelineScene() {
  const [qualityLevel, setQualityLevel] = useState(2)

  const handleFpsChange = (fps: number) => {
    if (fps < 30 && qualityLevel > 1) {
      setQualityLevel(1)
    } else if (fps >= 55 && qualityLevel < 2) {
      setQualityLevel(2)
    }
  }

  return (
    <Canvas
      camera={{ position: [25, 18, 25], fov: 50 }}
      gl={{
        antialias: false,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      dpr={[1, 1.5]}
      frameloop="always"
      style={{ background: 'linear-gradient(180deg, #050d1a 0%, #0a1628 100%)' }}
    >
      <PerformanceMonitor
        onDecline={() => handleFpsChange(25)}
        onIncline={() => handleFpsChange(60)}
      >
        <AdaptiveDpr pixelated />
        <Suspense fallback={null}>
          <SceneContent qualityLevel={qualityLevel} />
          <OrbitControls
            enableDamping
            dampingFactor={0.05}
            minDistance={10}
            maxDistance={70}
            maxPolarAngle={Math.PI / 2.05}
            enablePan={true}
            rotateSpeed={0.5}
            zoomSpeed={0.8}
          />
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  )
}

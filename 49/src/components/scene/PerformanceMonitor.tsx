import { useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { usePipelineStore } from '@/store/usePipelineStore'

const FRAME_WINDOW = 30
const LOW_FPS_THRESHOLD = 30
const HIGH_FPS_THRESHOLD = 45
const LOW_FPS_DURATION = 5000
const HIGH_FPS_DURATION = 3000

export default function PerformanceMonitor() {
  const frameTimesRef = useRef<number[]>([])
  const lastTimeRef = useRef(performance.now())
  const lowFpsStartTimeRef = useRef<number | null>(null)
  const highFpsStartTimeRef = useRef<number | null>(null)
  const [fps, setFps] = useState(60)
  const [showFps, setShowFps] = useState(true)

  const performanceMode = usePipelineStore((s) => s.performanceMode)
  const setPerformanceMode = usePipelineStore((s) => s.setPerformanceMode)
  const setDisableHighDetailLOD = usePipelineStore((s) => s.setDisableHighDetailLOD)
  const setDisableLabels = usePipelineStore((s) => s.setDisableLabels)
  const setDisableNodeGlow = usePipelineStore((s) => s.setDisableNodeGlow)

  const enablePerformanceMode = () => {
    setPerformanceMode(true)
    setDisableHighDetailLOD(true)
    setDisableLabels(true)
    setDisableNodeGlow(true)
  }

  const disablePerformanceMode = () => {
    setPerformanceMode(false)
    setDisableHighDetailLOD(false)
    setDisableLabels(false)
    setDisableNodeGlow(false)
  }

  useFrame(() => {
    const now = performance.now()
    const delta = now - lastTimeRef.current
    lastTimeRef.current = now

    frameTimesRef.current.push(delta)
    if (frameTimesRef.current.length > FRAME_WINDOW) {
      frameTimesRef.current.shift()
    }

    const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / frameTimesRef.current.length
    const currentFps = Math.round(1000 / avgFrameTime)
    setFps(currentFps)

    if (currentFps < LOW_FPS_THRESHOLD) {
      if (lowFpsStartTimeRef.current === null) {
        lowFpsStartTimeRef.current = now
        highFpsStartTimeRef.current = null
      } else if (now - lowFpsStartTimeRef.current > LOW_FPS_DURATION && !performanceMode) {
        enablePerformanceMode()
      }
    } else {
      lowFpsStartTimeRef.current = null
    }

    if (currentFps > HIGH_FPS_THRESHOLD && performanceMode) {
      if (highFpsStartTimeRef.current === null) {
        highFpsStartTimeRef.current = now
      } else if (now - highFpsStartTimeRef.current > HIGH_FPS_DURATION) {
        disablePerformanceMode()
        highFpsStartTimeRef.current = null
      }
    } else {
      highFpsStartTimeRef.current = null
    }
  })

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        setShowFps((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const fpsColor = fps >= 45 ? '#4caf50' : fps >= 30 ? '#ffc107' : '#f44336'

  if (!showFps) return null

  return (
    <Html position={[0, 0, 0]} style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'fixed',
          top: 12,
          right: 12,
          background: 'rgba(10,22,40,0.9)',
          border: `1px solid ${fpsColor}`,
          borderRadius: 4,
          padding: '6px 12px',
          fontFamily: 'monospace',
          fontSize: 12,
          color: fpsColor,
          pointerEvents: 'auto',
          cursor: 'pointer',
          userSelect: 'none',
          zIndex: 9999,
        }}
        onClick={() => setShowFps(false)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 'bold' }}>FPS: {fps}</span>
          {performanceMode && (
            <span style={{
              background: 'rgba(244,67,54,0.2)',
              padding: '2px 6px',
              borderRadius: 2,
              fontSize: 10,
            }}>
              PERF MODE
            </span>
          )}
        </div>
      </div>
    </Html>
  )
}

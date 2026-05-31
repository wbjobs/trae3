import { useState, useRef, useMemo, useEffect } from 'react'
import { Html } from '@react-three/drei'
import { X, RotateCcw } from 'lucide-react'
import { usePipelineStore } from '@/store/usePipelineStore'
import { useApi } from '@/hooks/useApi'
import type { CrossSectionData } from '../../../shared/types'

export default function CrossSectionView() {
  const selectedPipeId = usePipelineStore((s) => s.selectedPipeId)
  const showCrossSection = usePipelineStore((s) => s.showCrossSection)
  const pipes = usePipelineStore((s) => s.pipes)
  const nodes = usePipelineStore((s) => s.nodes)
  const setShowCrossSection = usePipelineStore((s) => s.setShowCrossSection)
  const setCrossSectionData = usePipelineStore((s) => s.setCrossSectionData)
  const crossSectionData = usePipelineStore((s) => s.crossSectionData)
  const api = useApi()

  const [rotation, setRotation] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [startX, setStartX] = useState(0)
  const [visible, setVisible] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  const selectedPipe = useMemo(
    () => pipes.find((p) => p.id === selectedPipeId),
    [pipes, selectedPipeId]
  )

  const midPosition = useMemo(() => {
    if (!selectedPipe) return { x: 0, y: 3, z: 0 }
    const [startId, endId] = selectedPipe.endpoints
    const startNode = nodes.find((n) => n.id === startId)
    const endNode = nodes.find((n) => n.id === endId)
    if (startNode && endNode) {
      return {
        x: (startNode.position.x + endNode.position.x) / 2,
        y: (startNode.position.y + endNode.position.y) / 2 + 3,
        z: (startNode.position.z + endNode.position.z) / 2,
      }
    }
    return { ...selectedPipe.position, y: selectedPipe.position.y + 3 }
  }, [selectedPipe, nodes])

  useEffect(() => {
    if (showCrossSection && selectedPipeId) {
      api.fetchCrossSection(selectedPipeId).then((data) => {
        setCrossSectionData(data)
        setVisible(true)
      }).catch(() => {
        setCrossSectionData(null)
        setVisible(true)
      })
    } else {
      setVisible(false)
      setTimeout(() => {
        setCrossSectionData(null)
      }, 300)
    }
  }, [showCrossSection, selectedPipeId, api, setCrossSectionData])

  useEffect(() => {
    if (!showCrossSection) {
      setRotation(0)
    }
  }, [showCrossSection])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setStartX(e.clientX)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    const delta = e.clientX - startX
    setRotation((prev) => prev + delta * 0.5)
    setStartX(e.clientX)
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleReset = () => {
    setRotation(0)
  }

  const handleClose = () => {
    setShowCrossSection(false)
  }

  if (!showCrossSection || !selectedPipe || !crossSectionData) {
    return null
  }

  return (
    <Html
      position={[midPosition.x, midPosition.y, midPosition.z]}
      center
      style={{
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.3s ease',
        pointerEvents: 'auto',
      }}
    >
      <div
        className="relative bg-[#0a1628]/95 backdrop-blur-xl rounded-xl border border-[#1a3a5c]/70 p-4 shadow-2xl"
        style={{
          width: '340px',
          transform: `scale(${visible ? 1 : 0.9})`,
          transition: 'transform 0.3s ease',
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-medium text-[#e0e8f0]">管道剖面图</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={handleReset}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] hover:text-[#e0e8f0] transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
            </button>
            <button
              onClick={handleClose}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-[#1a3a5c]/50 text-[#7a8fa6] hover:text-[#e0e8f0] transition-colors cursor-pointer"
            >
              <X size={12} />
            </button>
          </div>
        </div>

        <div
          className="relative cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <svg
            ref={svgRef}
            viewBox="0 0 200 200"
            className="w-full h-auto"
            style={{ transform: `rotate(${rotation}deg)`, transition: isDragging ? 'none' : 'transform 0.1s ease' }}
          >
            <defs>
              <radialGradient id="outerGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#1a3a5c" />
                <stop offset="100%" stopColor="#0a1628" />
              </radialGradient>
              <radialGradient id="innerGradient" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#00e5ff" stopOpacity="0.1" />
                <stop offset="100%" stopColor="#00e5ff" stopOpacity="0.05" />
              </radialGradient>
            </defs>

            <circle cx="100" cy="100" r="90" fill="url(#outerGradient)" stroke="#1a3a5c" strokeWidth="2" />
            <circle cx="100" cy="100" r="75" fill="url(#innerGradient)" stroke="#00e5ff" strokeWidth="1.5" strokeOpacity="0.5" />
            <circle cx="100" cy="100" r="60" fill="none" stroke="#00e5ff" strokeWidth="0.5" strokeDasharray="2,4" opacity="0.3" />

            {crossSectionData.corrosionLayers.map((layer) => {
              const startAngle = (layer.startAngle - 90) * (Math.PI / 180)
              const endAngle = (layer.endAngle - 90) * (Math.PI / 180)
              const outerR = 90
              const innerR = 90 - layer.depth * 8
              const x1 = 100 + outerR * Math.cos(startAngle)
              const y1 = 100 + outerR * Math.sin(startAngle)
              const x2 = 100 + outerR * Math.cos(endAngle)
              const y2 = 100 + outerR * Math.sin(endAngle)
              const x3 = 100 + innerR * Math.cos(endAngle)
              const y3 = 100 + innerR * Math.sin(endAngle)
              const x4 = 100 + innerR * Math.cos(startAngle)
              const y4 = 100 + innerR * Math.sin(startAngle)
              const largeArc = layer.endAngle - layer.startAngle > 180 ? 1 : 0
              const color = layer.severity === 'severe' ? '#ff3d00' : '#ffa726'

              return (
                <path
                  key={layer.id}
                  d={`M ${x1} ${y1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2} ${y2} L ${x3} ${y3} A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4} ${y4} Z`}
                  fill={color}
                  fillOpacity="0.6"
                  stroke={color}
                  strokeWidth="1"
                  className="animate-corrosion-pulse"
                />
              )
            })}

            {crossSectionData.pressureDistribution.map((point, i) => {
              const angle = (point.angle - 90) * (Math.PI / 180)
              const innerR = 75
              const outerR = 75 + point.value * 10
              const x1 = 100 + innerR * Math.cos(angle)
              const y1 = 100 + innerR * Math.sin(angle)
              const x2 = 100 + outerR * Math.cos(angle)
              const y2 = 100 + outerR * Math.sin(angle)

              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#00e5ff"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.7"
                />
              )
            })}

            <circle cx="100" cy="100" r="15" fill="#0a1628" stroke="#00e5ff" strokeWidth="1" />
            <text x="100" y="98" textAnchor="middle" fill="#00e5ff" fontSize="10" fontWeight="bold">
              {crossSectionData.pressure.toFixed(1)}
            </text>
            <text x="100" y="110" textAnchor="middle" fill="#7a8fa6" fontSize="6">
              MPa
            </text>
          </svg>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
          <div className="bg-[#1a3a5c]/30 rounded p-2">
            <div className="text-[#7a8fa6]">外径</div>
            <div className="text-[#e0e8f0] font-mono">{crossSectionData.outerDiameter}mm</div>
          </div>
          <div className="bg-[#1a3a5c]/30 rounded p-2">
            <div className="text-[#7a8fa6]">壁厚</div>
            <div className="text-[#e0e8f0] font-mono">{crossSectionData.wallThickness}mm</div>
          </div>
          <div className="bg-[#1a3a5c]/30 rounded p-2">
            <div className="text-[#7a8fa6]">材质</div>
            <div className="text-[#e0e8f0]">{crossSectionData.material}</div>
          </div>
          <div className="bg-[#1a3a5c]/30 rounded p-2">
            <div className="text-[#7a8fa6]">预估寿命</div>
            <div className={`font-mono ${crossSectionData.riskLevel === 'high' ? 'text-pipeline-alarm' : crossSectionData.riskLevel === 'medium' ? 'text-pipeline-warn' : 'text-pipeline-ok'}`}>
              {crossSectionData.estimatedLife}年
            </div>
          </div>
        </div>
      </div>
    </Html>
  )
}

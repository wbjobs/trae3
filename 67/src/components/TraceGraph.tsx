import { useState, useMemo, useCallback } from 'react'
import type { TraceResult, TraceNode, TraceEdge, NodeStatus } from '../../shared/types'
import { Network, Cpu, Database, Server, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TraceGraphProps {
  trace: TraceResult | null
  onNodeClick?: (node: TraceNode) => void
}

const nodeTypeIcons = {
  service: Server,
  node: Cpu,
  metric: Activity,
  database: Database,
  network: Network,
}

const statusColors: Record<NodeStatus, { fill: string; stroke: string; text: string }> = {
  healthy: { fill: '#10b981', stroke: '#059669', text: '#ffffff' },
  warning: { fill: '#f59e0b', stroke: '#d97706', text: '#ffffff' },
  critical: { fill: '#ef4444', stroke: '#dc2626', text: '#ffffff' },
}

function layoutNodes(nodes: TraceNode[], edges: TraceEdge[], width: number, height: number): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>()

  const inDegree = new Map<string, number>()
  const outDegree = new Map<string, number>()
  nodes.forEach((n) => {
    inDegree.set(n.id, 0)
    outDegree.set(n.id, 0)
  })

  edges.forEach((e) => {
    inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1)
    outDegree.set(e.from, (outDegree.get(e.from) || 0) + 1)
  })

  const levels: string[][] = []
  const visited = new Set<string>()
  const levelNodes = new Set<string>()

  nodes
    .filter((n) => (inDegree.get(n.id) || 0) === 0)
    .forEach((n) => {
      levelNodes.add(n.id)
    })

  while (levelNodes.size > 0 && levels.length < 10) {
    const currentLevel = Array.from(levelNodes)
    levels.push(currentLevel)
    currentLevel.forEach((id) => visited.add(id))

    const nextLevel = new Set<string>()
    currentLevel.forEach((id) => {
      edges
        .filter((e) => e.from === id)
        .forEach((e) => {
          if (!visited.has(e.to)) {
            nextLevel.add(e.to)
          }
        })
    })

    levelNodes.clear()
    nextLevel.forEach((id) => levelNodes.add(id))
  }

  nodes.forEach((n) => {
    if (!visited.has(n.id)) {
      if (levels.length === 0) levels.push([])
      levels[levels.length - 1].push(n.id)
    }
  })

  const levelCount = levels.length
  const levelSpacing = height / (levelCount + 1)

  levels.forEach((level, levelIdx) => {
    const nodeCount = level.length
    const nodeSpacing = width / (nodeCount + 1)
    level.forEach((nodeId, nodeIdx) => {
      positions.set(nodeId, {
        x: nodeSpacing * (nodeIdx + 1),
        y: levelSpacing * (levelIdx + 1),
      })
    })
  })

  return positions
}

export default function TraceGraph({ trace, onNodeClick }: TraceGraphProps) {
  const [selectedNode, setSelectedNode] = useState<TraceNode | null>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 })

  const svgRef = useCallback((node: SVGSVGElement | null) => {
    if (node) {
      const rect = node.getBoundingClientRect()
      setDimensions({ width: rect.width, height: 500 })
    }
  }, [])

  const { nodePositions, edgePaths } = useMemo(() => {
    if (!trace || trace.nodes.length === 0) {
      return { nodePositions: new Map(), edgePaths: [] }
    }

    const positions = layoutNodes(trace.nodes, trace.edges, dimensions.width, dimensions.height)
    const paths = trace.edges.map((edge) => {
      const from = positions.get(edge.from)
      const to = positions.get(edge.to)
      if (!from || !to) return null

      const isOnPath = trace.propagationPath.includes(edge.from) && trace.propagationPath.includes(edge.to)
      const fromIdx = trace.propagationPath.indexOf(edge.from)
      const toIdx = trace.propagationPath.indexOf(edge.to)
      const isPropagationEdge = isOnPath && fromIdx >= 0 && toIdx >= 0 && toIdx === fromIdx + 1

      return {
        edge,
        from,
        to,
        isPropagationEdge,
      }
    }).filter(Boolean) as { edge: TraceEdge; from: { x: number; y: number }; to: { x: number; y: number }; isPropagationEdge: boolean }[]

    return { nodePositions: positions, edgePaths: paths }
  }, [trace, dimensions])

  const handleNodeClick = (node: TraceNode) => {
    setSelectedNode(node)
    onNodeClick?.(node)
  }

  if (!trace || trace.nodes.length === 0) {
    return (
      <div className="bg-ops-card rounded-xl border border-ops-border p-8 animate-fade-in flex items-center justify-center h-[500px]">
        <div className="text-center text-ops-muted">
          <Network className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No trace data available</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-ops-card rounded-xl border border-ops-border p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-ops-text text-sm font-semibold">Fault Propagation Graph</h3>
        <div className="flex items-center gap-4 text-xs text-ops-muted">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-ops-accent" />
            <span>Healthy</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-ops-warning" />
            <span>Warning</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-ops-critical" />
            <span>Critical</span>
          </div>
        </div>
      </div>

      <div className="relative">
        <svg
          ref={svgRef}
          width="100%"
          height="500"
          className="overflow-visible"
          style={{ overflow: 'visible' }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#64748b" />
            </marker>
            <marker
              id="arrowhead-propagation"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill="#06d6a0" />
            </marker>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {edgePaths.map(({ edge, from, to, isPropagationEdge }, idx) => {
            const strokeWidth = Math.max(1, Math.min(4, edge.weight * 3))

            return (
              <g key={idx}>
                <line
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  stroke={isPropagationEdge ? '#06d6a0' : '#475569'}
                  strokeWidth={strokeWidth}
                  strokeDasharray={isPropagationEdge ? '8 4' : 'none'}
                  markerEnd={isPropagationEdge ? 'url(#arrowhead-propagation)' : 'url(#arrowhead)'}
                  className={cn(
                    'transition-all duration-300',
                    isPropagationEdge && 'animate-pulse'
                  )}
                  style={{
                    strokeDashoffset: isPropagationEdge ? 0 : undefined,
                    animation: isPropagationEdge ? 'dash 1s linear infinite' : undefined,
                  }}
                />
                <title>{`${edge.type} (weight: ${edge.weight.toFixed(2)})`}</title>
              </g>
            )
          })}

          {trace.nodes.map((node) => {
            const pos = nodePositions.get(node.id)
            if (!pos) return null

            const Icon = nodeTypeIcons[node.type] || Server
            const colors = statusColors[node.status]
            const isRootCause = trace.rootCauses.some((r) => r.nodeId === node.id)
            const nodeRadius = isRootCause ? 28 : 22
            const isSelected = selectedNode?.id === node.id
            const isOnPropagationPath = trace.propagationPath.includes(node.id)

            return (
              <g
                key={node.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                className="cursor-pointer transition-transform duration-200 hover:scale-110"
                onClick={() => handleNodeClick(node)}
                filter={isOnPropagationPath ? 'url(#glow)' : undefined}
              >
                <circle
                  r={nodeRadius}
                  fill={colors.fill}
                  stroke={isSelected ? '#06d6a0' : colors.stroke}
                  strokeWidth={isSelected ? 3 : 2}
                  className="transition-all duration-200"
                />
                <g transform="translate(-10, -10)">
                  <Icon className="w-5 h-5" color={colors.text} />
                </g>
                <text
                  y={nodeRadius + 16}
                  textAnchor="middle"
                  fill="#e2e8f0"
                  fontSize="10"
                  fontFamily="monospace"
                  className="pointer-events-none select-none"
                >
                  {node.name}
                </text>
              </g>
            )
          })}
        </svg>

        {selectedNode && (
          <div className="absolute top-4 right-4 bg-ops-card border border-ops-border rounded-lg p-3 shadow-xl w-64 animate-fade-in">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-ops-text text-sm font-semibold">{selectedNode.name}</h4>
              <span
                className={cn(
                  'px-1.5 py-0.5 rounded text-[10px] font-mono font-bold',
                  selectedNode.status === 'healthy' && 'bg-ops-accent/20 text-ops-accent',
                  selectedNode.status === 'warning' && 'bg-ops-warning/20 text-ops-warning',
                  selectedNode.status === 'critical' && 'bg-ops-critical/20 text-ops-critical'
                )}
              >
                {selectedNode.status.toUpperCase()}
              </span>
            </div>
            <div className="space-y-1 text-[11px] font-mono">
              <div className="flex justify-between">
                <span className="text-ops-muted">Type:</span>
                <span className="text-ops-text">{selectedNode.type}</span>
              </div>
              {selectedNode.metricType && (
                <div className="flex justify-between">
                  <span className="text-ops-muted">Metric:</span>
                  <span className="text-ops-text">{selectedNode.metricType}</span>
                </div>
              )}
              {selectedNode.value !== undefined && (
                <div className="flex justify-between">
                  <span className="text-ops-muted">Value:</span>
                  <span className="text-ops-text">{selectedNode.value.toFixed(2)}</span>
                </div>
              )}
              {selectedNode.anomalies.length > 0 && (
                <div className="pt-1 border-t border-ops-border mt-1">
                  <span className="text-ops-muted block mb-1">Anomalies:</span>
                  <div className="text-ops-critical text-xs">
                    {selectedNode.anomalies.length} detected
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes dash {
          to {
            stroke-dashoffset: -12;
          }
        }
      `}</style>
    </div>
  )
}
